// models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    message: {
        type: String, // Para mensagens de texto
        required: false // Pode ser nulo se for áudio
    },
    audio: {
        type: String, // Para áudio em base64
        required: false // Pode ser nulo se for texto
    },
    room: {
        type: String,
        required: true,
        trim: true,
        lowercase: true // Garante que o nome da sala é salvo em minúsculas
    },
    type: {
        type: String, // 'text' ou 'audio'
        enum: ['text', 'audio'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

// Adiciona um índice para a sala para buscas mais rápidas
MessageSchema.index({ room: 1, timestamp: -1 });

module.exports = mongoose.model('Message', MessageSchema);