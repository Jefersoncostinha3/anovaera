const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Certifique-se de que os modelos de usuário e mensagem estão corretos e no caminho certo
const User = require('./models/User');
const Message = require('./models/Message'); // Importa o modelo de mensagem

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Conexão com o MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB conectado com sucesso!');
    } catch (error) {
        console.error(`Erro ao conectar ao MongoDB: ${error.message}`);
        process.exit(1); // Sai do processo se a conexão falhar
    }
};
connectDB();

// Middleware para analisar corpos de requisição JSON
app.use(express.json());
// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// --- Rotas de Autenticação (REST API) ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    console.log('Requisição de registro recebida:', { username, password });
    if (!username || !password) {
        console.log('Erro: Usuário e senha são obrigatórios (backend)');
        return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
    }
    try {
        const userExists = await User.findOne({ username });
        if (userExists) {
            console.log('Erro: Nome de usuário já existe (backend)');
            return res.status(400).json({ message: 'Nome de usuário já existe. Escolha outro.' });
        }
        const user = await User.create({ username, password });
        console.log('Usuário registrado com sucesso:', user.username);
        res.status(201).json({ message: 'Usuário registrado com sucesso!', username: user.username });
    } catch (error) {
        console.error("ERRO GRAVE NO REGISTRO (BACKEND):", error);
        res.status(500).json({ message: 'Erro no servidor ao registrar usuário.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Requisição de login recebida:', { username, password });
    if (!username || !password) {
        console.log('Erro: Usuário e senha são obrigatórios (login backend)');
        return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
    }
    try {
        const user = await User.findOne({ username });
        if (user && (await user.matchPassword(password))) {
            console.log('Login bem-sucedido:', user.username);
            res.status(200).json({ message: 'Login bem-sucedido!', username: user.username });
        } else {
            console.log('Credenciais inválidas (login backend)');
            res.status(401).json({ message: 'Credenciais inválidas. Verifique usuário e senha.' });
        }
    } catch (error) {
        console.error("ERRO GRAVE NO LOGIN (BACKEND):", error);
        res.status(500).json({ message: 'Erro no servidor ao fazer login.' });
    }
});

// --- Lógica do Socket.IO (Chat em Tempo Real) ---

// Mapas para gerenciar usuários e salas ativas em memória
const connectedUsers = {}; // Mapeia socket.id para username
// rooms agora gerencia apenas os sockets CONECTADOS ativamente a cada sala.
// A existência das salas é definida pelas mensagens persistentes ou por uma lista predefinida.
const rooms = { 'público': new Set() }; // 'público' é a sala padrão, sempre existe.

// Função para obter todas as salas que já tiveram mensagens OU que têm usuários conectados
async function getAllKnownRooms() {
    try {
        // Busca todas as salas que têm mensagens no banco de dados
        const roomsFromDB = await Message.distinct('room');
        
        // Combina com as salas que têm usuários conectados no momento
        const currentActiveRooms = Object.keys(rooms).filter(roomName => rooms[roomName].size > 0);

        // Cria um Set para garantir unicidade e depois converte para Array
        const combinedRooms = new Set([...roomsFromDB, ...currentActiveRooms]);

        // Garante que 'público' sempre esteja na lista, independentemente de ter mensagens ou usuários
        if (!combinedRooms.has('público')) {
            combinedRooms.add('público');
        }

        return Array.from(combinedRooms).sort((a, b) => {
            if (a === 'público') return -1;
            if (b === 'público') return 1;
            return a.localeCompare(b);
        });
    } catch (error) {
        console.error("Erro ao obter todas as salas conhecidas:", error);
        return ['público']; // Retorna apenas público em caso de erro
    }
}

// Função para enviar a lista de salas ativas para todos os usuários
async function emitActiveRooms() {
    const activeRooms = await getAllKnownRooms(); // Pega todas as salas conhecidas/ativas
    console.log('Emitindo salas ativas:', activeRooms);
    io.emit('active-rooms-list', activeRooms);
}

io.on('connection', async (socket) => {
    console.log(`Um usuário conectou ao Socket.IO: ${socket.id}`);

    // Ao conectar, envia a lista de salas ativas
    await emitActiveRooms();

    socket.on('set-username', async (username) => {
        connectedUsers[socket.id] = username;
        console.log(`Usuário autenticado no Socket.IO: ${username} (ID: ${socket.id})`);
        
        // Coloca o usuário na sala 'público' automaticamente ao setar username
        if (!socket.rooms.has('público')) {
            socket.join('público');
            if (!rooms['público']) rooms['público'] = new Set(); // Garante que o Set existe
            rooms['público'].add(socket.id);
            io.to('público').emit('user-connected', username);
            console.log(`Usuário ${username} entrou na sala: Público`);
            
            // Carrega mensagens antigas para a sala 'público'
            const historicalMessages = await Message.find({ room: 'público' })
                                                    .sort({ timestamp: 1 }) // Ordena do mais antigo para o mais novo
                                                    .limit(50); // Limita às últimas 50 mensagens
            socket.emit('previous-messages', historicalMessages);
            await emitActiveRooms(); // Atualiza a lista de salas
        }
    });

    socket.on('disconnect', async () => {
        const username = connectedUsers[socket.id];
        if (username) {
            console.log(`Usuário desconectou do Socket.IO: ${username} (ID: ${socket.id})`);
            // Remove o socket de todas as salas onde ele estava
            for (const roomName in rooms) {
                if (rooms[roomName].has(socket.id)) {
                    rooms[roomName].delete(socket.id);
                    // IMPORTANTE: Salas NÃO são mais deletadas se ficarem vazias aqui.
                    // Elas são "fixas" se tiverem histórico no DB.
                    // A sala 'público' nunca é deletada.
                    console.log(`Usuário ${username} saiu da sala: ${roomName}`);
                }
            }
            delete connectedUsers[socket.id]; // Remove o usuário do mapa de conectados
            await emitActiveRooms(); // Atualiza a lista de salas
        }
    });

    socket.on('send-message', async (data) => {
        const username = connectedUsers[socket.id];
        const roomName = data.room ? data.room.toLowerCase() : 'público'; // Normaliza o nome da sala

        if (username) {
            const message = {
                username: username,
                message: data.text,
                room: roomName,
                type: 'text',
                timestamp: new Date()
            };
            console.log(`Mensagem recebida na sala ${message.room}: ${message.username}: ${message.message}`);
            
            try {
                const newMessage = new Message(message);
                await newMessage.save(); // Salva a mensagem no DB
                console.log('Mensagem salva no DB.');
            } catch (error) {
                console.error('Erro ao salvar mensagem no DB:', error);
            }
            
            io.to(roomName).emit('new-message', message); // Emite para a sala
        } else {
            socket.emit('login-error', 'Você precisa estar logado para enviar mensagens.');
        }
    });

    socket.on('send-audio', async (data) => {
        const username = connectedUsers[socket.id];
        const roomName = data.room ? data.room.toLowerCase() : 'público'; // Normaliza o nome da sala

        if (username) {
            const audioMessage = {
                username: username,
                audio: data.audio,
                room: roomName,
                type: 'audio',
                timestamp: new Date()
            };
            console.log(`Áudio recebido na sala ${audioMessage.room} de ${audioMessage.username}`);
            
            try {
                const newAudioMessage = new Message(audioMessage);
                await newAudioMessage.save(); // Salva o áudio no DB
                console.log('Áudio salvo no DB.');
            } catch (error) {
                console.error('Erro ao salvar áudio no DB:', error);
            }

            io.to(roomName).emit('new-audio', audioMessage); // Emite para a sala
        } else {
            socket.emit('login-error', 'Você precisa estar logado para enviar áudio.');
        }
    });

    socket.on('create-room', async (roomName) => {
        const username = connectedUsers[socket.id];
        if (!username) {
            socket.emit('room-error', 'Você precisa estar logado para criar uma sala.');
            return;
        }

        const normalizedRoomName = roomName.trim().toLowerCase();
        if (normalizedRoomName === '' || normalizedRoomName === 'público') {
            socket.emit('room-error', 'Nome de sala inválido ou reservado.');
            return;
        }

        // Verifica se a sala já existe no banco de dados ou em memória (para casos onde já tem gente mas não mensagens)
        const roomExistsInDB = await Message.findOne({ room: normalizedRoomName });
        const roomExistsInMemory = rooms[normalizedRoomName] !== undefined; // Verifica se a chave existe no mapa 'rooms'

        if (roomExistsInDB || roomExistsInMemory) {
            socket.emit('room-error', `A sala "${roomName}" já existe. Escolha outro nome.`);
            return;
        }

        // Criar uma sala agora significa apenas que ela estará disponível para ser unida.
        // A persistência começa quando a primeira mensagem é enviada para ela.
        rooms[normalizedRoomName] = new Set(); // Adiciona ao controle de salas em memória
        console.log(`Sala criada (em memória): ${normalizedRoomName} por ${username}`);
        socket.emit('room-created', roomName); // Envia o nome original para o frontend para a mensagem de alerta
        await emitActiveRooms(); // Atualiza a lista de salas
    });

    socket.on('join-room', async (roomName) => {
        const username = connectedUsers[socket.id];
        if (!username) {
            socket.emit('room-error', 'Você precisa estar logado para entrar em uma sala.');
            return;
        }

        const normalizedRoomName = roomName.trim().toLowerCase();
        if (normalizedRoomName === '') {
            socket.emit('room-error', 'O nome da sala não pode ser vazio.');
            return;
        }

        // Verificar se a sala existe em 'rooms' (foi criada ou já tinha usuários)
        // OU se ela tem histórico no DB (é uma sala persistente mas atualmente vazia)
        // OU se é a sala padrão 'público'
        const roomExistsInDB = await Message.findOne({ room: normalizedRoomName });
        const roomExistsInOurMemoryMap = rooms[normalizedRoomName] !== undefined; // Verifica se a chave existe no mapa 'rooms'

        // A condição foi ajustada aqui! Uma sala é válida para entrar se:
        // 1. Já tiver histórico no DB (roomExistsInDB)
        // 2. Já tiver sido adicionada ao nosso mapa de salas em memória (roomExistsInOurMemoryMap)
        // 3. For a sala 'público'
        if (!roomExistsInDB && !roomExistsInOurMemoryMap && normalizedRoomName !== 'público') {
            socket.emit('room-error', `A sala "${roomName}" não foi encontrada ou não tem histórico/usuários. Verifique o nome.`);
            return;
        }
        
        // Se a sala foi encontrada no DB ou é a sala padrão, mas não está em 'rooms', adicione-a.
        // Isso cobre o caso de uma sala persistente estar vazia e alguém ser o primeiro a entrar nela.
        if (!rooms[normalizedRoomName]) {
            rooms[normalizedRoomName] = new Set();
        }

        // Deixa a sala atual antes de entrar em uma nova
        for (const room of socket.rooms) {
            if (room !== socket.id) { // Não queremos sair do próprio socket.id
                socket.leave(room);
                const currentRoomSet = rooms[room];
                if (currentRoomSet) {
                    currentRoomSet.delete(socket.id);
                }
            }
        }
        
        socket.join(normalizedRoomName); // O Socket.IO sempre usa lowercase para o nome da sala ao fazer join/emit
        rooms[normalizedRoomName].add(socket.id);
        
        console.log(`Usuário ${username} entrou na sala: ${normalizedRoomName}`);
        socket.emit('room-joined', roomName); // Envia o nome ORIGINAL da sala para o frontend (para exibir)
        io.to(normalizedRoomName).emit('user-connected', username); // Emite para a sala (minúsculas)

        // Carrega mensagens antigas para a sala recém-entrada
        const historicalMessages = await Message.find({ room: normalizedRoomName })
                                                    .sort({ timestamp: 1 }) // Ordena do mais antigo para o mais novo
                                                    .limit(50); // Limita às últimas 50 mensagens
        socket.emit('previous-messages', historicalMessages);
        
        await emitActiveRooms();
    });

    socket.on('request-active-rooms', async () => {
        await emitActiveRooms();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
