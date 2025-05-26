const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true, // Garante que não haverá usuários com o mesmo nome
        trim: true    // Remove espaços em branco antes/depois
    },
    password: {
        type: String,
        required: true
    }
}, {
    timestamps: true // Adiciona campos createdAt e updatedAt automaticamente
});

// Método para criptografar a senha ANTES de salvar o usuário
userSchema.pre('save', async function (next) {
    // Só criptografa se a senha foi modificada (ou é nova)
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10); // Gera um "sal" para a criptografia
    this.password = await bcrypt.hash(this.password, salt); // Criptografa a senha
});

// Método para comparar a senha fornecida no login com a senha criptografada no banco
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;