// Importa o módulo 'express' para criar e gerenciar o servidor web.
const express = require('express');

// Importa o módulo 'path', nativo do Node.js, para lidar com caminhos de arquivos e diretórios.
// É essencial para construir caminhos de forma que funcionem tanto no seu computador quanto no Render.
const path = require('path');

// Cria uma instância do aplicativo Express.
const app = express();

// Define a porta em que o servidor irá escutar.
// process.env.PORT é uma variável de ambiente que o Render (e outras plataformas de hospedagem)
// injetam para dizer ao seu aplicativo qual porta usar.
// Se process.env.PORT não estiver definida (por exemplo, quando você roda localmente),
// ele usará a porta 3000 como padrão.
const PORT = process.env.PORT || 3000;

// --- Configuração para Servir Arquivos Estáticos ---

// Esta é a linha mais importante para servir seu front-end (HTML, CSS, JS, imagens).
// O middleware 'express.static' instrui o Express a servir arquivos diretamente
// de um diretório especificado.
// path.join(__dirname, 'public') constrói o caminho completo para a pasta 'public',
// garantindo que ele seja encontrado corretamente no Render.
//
// Ex: Se você tiver public/css/style.css, ele será acessível em /css/style.css
// Ex: Se você tiver public/index.html, ele será acessível em /index.html
app.use(express.static(path.join(__dirname, 'public')));

// --- Rota para a URL Raiz (Home Page) ---

// Esta rota lida com requisições para a URL raiz da sua aplicação (ex: https://seu-app.onrender.com/).
// Quando alguém acessa a URL base, esta rota é acionada.
// res.sendFile() envia o arquivo 'index.html' que está dentro da sua pasta 'public'.
// Isso faz com que sua página inicial seja 'index.html' automaticamente.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Exemplo de Rota de API (Opcional) ---

// Se sua aplicação tiver alguma lógica de back-end (uma API, por exemplo),
// você pode adicionar suas rotas aqui.
// Esta é apenas uma rota de exemplo que retorna um JSON.
app.get('/api/saudacao', (req, res) => {
  res.json({ message: 'Olá do seu servidor Node.js (API)!' });
});

// --- Início do Servidor ---

// Faz o servidor Express começar a escutar as requisições na porta definida.
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT} (localmente)`); // Para testar no seu computador
});
