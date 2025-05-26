const socket = io();
let myUsername = null;
let mediaRecorder;
let audioChunks = [];
let currentRoom = 'Público'; // Inicialmente na sala padrão 'Público'

// Referências aos elementos do DOM
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
const mainChatLayout = document.getElementById('main-chat-layout');
const chatMainContent = document.getElementById('chat-main-content');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerError = document.getElementById('register-error');
const startRecordBtn = document.getElementById('start-record-btn');
const stopRecordBtn = document.getElementById('stop-record-btn');
const audioPreview = document.getElementById('audio-preview');
const createRoomInput = document.getElementById('create-room-name');
const joinRoomInput = document.getElementById('join-room-name');
const currentRoomDisplay = document.getElementById('current-room');
const activeRoomsList = document.getElementById('active-rooms-list');


// --- Funções de Exibição (Login/Registro/Chat) ---
function showRegister() {
    if (loginContainer && registerContainer && registerError && loginError) {
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
        loginError.textContent = '';
        registerError.textContent = '';
    }
}

function showLogin() {
    if (registerContainer && loginContainer && registerError && loginError) {
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
        registerError.textContent = '';
        loginError.textContent = '';
    }
}

function showChat() {
    if (loginContainer && registerContainer && mainChatLayout) {
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'none';
        mainChatLayout.style.display = 'flex';
        
        initializeMicrophone();
        socket.emit('request-active-rooms');
    }
}

async function initializeMicrophone() {
    if (navigator.mediaDevices && startRecordBtn && stopRecordBtn && audioPreview) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                audioPreview.src = URL.createObjectURL(audioBlob);
                audioPreview.style.display = 'block';

                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64Audio = reader.result.split(',')[1];
                    socket.emit('send-audio', { audio: base64Audio, room: currentRoom });
                };
                reader.readAsDataURL(audioBlob);

                audioChunks = [];
                stopRecordBtn.disabled = true;
                startRecordBtn.disabled = false;
            };

            startRecordBtn.disabled = false;
        } catch (err) {
            console.error("Erro ao acessar o microfone:", err);
            alert("Erro ao acessar o microfone. Verifique as permissões do seu navegador.");
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = true;
        }
    }
}

// --- Funções de Autenticação ---
async function register() {
    if (registerUsernameInput && registerPasswordInput && registerError) {
        const username = registerUsernameInput.value.trim();
        const password = registerPasswordInput.value.trim();

        if (!username || !password) {
            registerError.textContent = 'Usuário e senha são obrigatórios.';
            return;
        }

        registerError.textContent = '';

        try {
            console.log('Tentando registrar usuário:', username);
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            console.log('Resposta do servidor ao registrar:', data);

            if (response.ok) {
                alert(data.message);
                showLogin();
                registerUsernameInput.value = '';
                registerPasswordInput.value = '';
            } else {
                registerError.textContent = data.message || 'Erro ao registrar. Tente novamente.';
            }
        } catch (error) {
            console.error('Erro de rede ou servidor ao registrar:', error);
            registerError.textContent = 'Erro ao conectar com o servidor. Verifique sua conexão e tente novamente.';
        }
    }
}

async function login() {
    if (loginUsernameInput && loginPasswordInput && loginError) {
        const username = loginUsernameInput.value.trim();
        const password = loginPasswordInput.value.trim();

        if (!username || !password) {
            loginError.textContent = 'Usuário e senha são obrigatórios.';
            return;
        }

        loginError.textContent = '';

        try {
            console.log('Tentando logar usuário:', username);
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            console.log('Resposta do servidor ao logar:', data);

            if (response.ok) {
                myUsername = data.username;
                socket.emit('set-username', myUsername);
                showChat();
            } else {
                loginError.textContent = data.message || 'Credenciais inválidas. Verifique usuário e senha.';
            }
        } catch (error) {
            console.error('Erro de rede ou servidor ao fazer login:', error);
            loginError.textContent = 'Erro ao conectar com o servidor. Verifique sua conexão e tente novamente.';
        }
    }
}

// --- Funções do Chat ---
function addMessage(data) {
    if (messagesDiv) {
        const isSystemMessage = data.username && (data.username.startsWith('Sistema'));
        // Converte o nome da sala atual e da mensagem para minúsculas para comparação
        const messageBelongsToCurrentRoom = (data.room && data.room.toLowerCase() === currentRoom.toLowerCase());

        // Adiciona a mensagem se for do sistema ou se for da sala atual
        if (isSystemMessage || messageBelongsToCurrentRoom) {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');

            const usernameSpan = document.createElement('span');
            usernameSpan.classList.add('user');
            usernameSpan.textContent = isSystemMessage ? `${data.username}:` : `${data.username || 'Desconhecido'}:`;

            messageElement.appendChild(usernameSpan);

            if (data.type === 'audio' && data.audio) {
                const audioElement = document.createElement('audio');
                audioElement.controls = true;
                audioElement.src = `data:audio/webm;codecs=opus;base64,${data.audio}`;
                messageElement.appendChild(document.createTextNode(' Áudio: '));
                messageElement.appendChild(audioElement);
            } else if (data.type === 'text' && data.message) {
                messageElement.appendChild(document.createTextNode(data.message));
            }
            
            messagesDiv.appendChild(messageElement);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }
}

function sendMessage() {
    if (messageInput && myUsername && socket) {
        const messageText = messageInput.value.trim();
        if (messageText) {
            socket.emit('send-message', { text: messageText, room: currentRoom });
            messageInput.value = '';
        } else if (!myUsername) {
            alert('Você precisa estar logado para enviar mensagens.');
        }
    }
}

function startRecording() {
    if (mediaRecorder && mediaRecorder.state === 'inactive') {
        audioChunks = [];
        mediaRecorder.start();
        startRecordBtn.disabled = true;
        stopRecordBtn.disabled = false;
        audioPreview.style.display = 'none';
    } else {
        console.log("Recorder já está ativo ou não foi inicializado.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    } else {
        console.log("Recorder não está ativo para parar.");
    }
}

function createPrivateRoom() {
    if (createRoomInput && socket) {
        const roomName = createRoomInput.value.trim();
        if (roomName) {
            socket.emit('create-room', roomName);
            createRoomInput.value = '';
        } else {
            alert('Por favor, digite um nome para a nova sala.');
        }
    }
}

function joinPrivateRoom(roomNameFromList = null) {
    let roomName;
    if (roomNameFromList) {
        roomName = roomNameFromList;
    } else if (joinRoomInput) {
        roomName = joinRoomInput.value.trim();
    }

    if (roomName) {
        socket.emit('join-room', roomName);
        if (joinRoomInput) joinRoomInput.value = '';
    } else {
        alert('Por favor, digite o nome da sala para entrar ou selecione uma da lista.');
    }
}

function updateActiveRoomsList(rooms) {
    if (activeRoomsList) {
        activeRoomsList.innerHTML = ''; // Limpa a lista existente

        if (rooms.length === 0 || (rooms.length === 1 && rooms[0].toLowerCase() === 'público')) {
            const noRoomsItem = document.createElement('li');
            noRoomsItem.textContent = 'Nenhuma sala ativa (além da Pública)';
            noRoomsItem.style.color = '#777';
            noRoomsItem.style.textAlign = 'center';
            activeRoomsList.appendChild(noRoomsItem);
        } else {
            rooms.forEach(roomName => {
                const listItem = document.createElement('li');
                listItem.classList.add('room-item');
                // Exibe o nome da sala como veio do servidor (pode ser "Público" ou "MinhaSala")
                listItem.textContent = roomName; 
                listItem.onclick = () => joinPrivateRoom(roomName);
                activeRoomsList.appendChild(listItem);
            });
        }
    }
}


// --- Event Listeners e Eventos Socket.IO ---

if (messageInput) {
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

socket.on('connect', () => {
    console.log('Conectado ao servidor Socket.IO');
    if (myUsername) {
        socket.emit('set-username', myUsername);
    }
    socket.emit('request-active-rooms');
});

socket.on('disconnect', () => {
    console.log('Desconectado do servidor Socket.IO');
});

socket.on('new-message', (message) => {
    addMessage(message);
});

socket.on('new-audio', (audioData) => {
    addMessage(audioData);
});

socket.on('user-connected', (username) => {
    if (username !== myUsername) {
        // A mensagem de "entrou na sala" agora é tratada no 'room-joined' após o carregamento do histórico
        // Não adicione aqui para evitar duplicidade ou aparecer antes do histórico
    }
});

socket.on('user-disconnected', (username) => {
    addMessage({ username: 'Sistema', message: `${username} saiu da sala "${currentRoom}".`, type: 'text', room: currentRoom });
});

// NOVO: Evento para receber mensagens antigas ao entrar em uma sala
socket.on('previous-messages', (messages) => {
    if (messagesDiv) {
        messagesDiv.innerHTML = ''; // Limpa as mensagens atuais antes de carregar as antigas
        messages.forEach(addMessage); // Adiciona cada mensagem antiga
        messagesDiv.scrollTop = messagesDiv.scrollHeight; // Rola para o final após carregar
    }
});

socket.on('room-created', (roomName) => {
    alert(`Sala "${roomName}" criada com sucesso! Entrando na sala...`);
    socket.emit('join-room', roomName); // Tenta entrar na sala recém-criada
});

socket.on('room-joined', (roomName) => {
    if (currentRoomDisplay && messagesDiv) {
        currentRoom = roomName; // Atualiza a sala atual no frontend
        currentRoomDisplay.textContent = `Sala atual: ${roomName}`;
        // Adiciona uma mensagem de sistema após o histórico ser carregado (pelo previous-messages)
        addMessage({ username: 'Sistema', message: `Você entrou na sala "${roomName}".`, type: 'text', room: roomName });
    }
});

socket.on('room-error', (message) => {
    // Garante que a mensagem de erro é exibida na sala atual
    addMessage({ username: 'Sistema (Erro)', message: message, type: 'text', room: currentRoom });
});

socket.on('login-error', (message) => {
    if (loginError && mainChatLayout && registerContainer && loginContainer) {
        loginError.textContent = message;
        mainChatLayout.style.display = 'none';
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
    }
});

socket.on('active-rooms-list', (rooms) => {
    console.log('Salas ativas recebidas:', rooms);
    updateActiveRoomsList(rooms);
});


// --- Inicialização da Interface ---
document.addEventListener('DOMContentLoaded', () => {
    if (mainChatLayout) mainChatLayout.style.display = 'none';
    if (loginContainer) loginContainer.style.display = 'block';
    if (registerContainer) registerContainer.style.display = 'none';
});