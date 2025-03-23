require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("./user");
const authenticateToken = require("./middleware"); // Importando o middleware de autenticação

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true 
}).then(() => console.log("Conectado ao MongoDB"))
  .catch(err => console.error("Erro ao conectar ao MongoDB:", err));

const generateReportWithOpenRouter = async (prompt) => {
  try {
    // Adiciona uma instrução fixa ao prompt para garantir que a resposta seja formatada em HTML
    const formattedPrompt = `
      Crie um conteúdo bem estruturado com títulos, subtítulos e parágrafos. Todos os elementos precisam ser formatados em HTML.
      O conteúdo gerado deve ser claro, com destaque para termos importantes, utilizando tags HTML como <h1>, <h2>, <p>, <strong>, <em>, etc.
      Em caso de gerar algum texto com alguma cor, use sempre este formato <span style="color: cor desejada"> mas com a cor que for defina abaixo
      Aqui está o prompt do usuário:
      ${prompt}
    `;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.SITE_URL || '',
        'X-Title': process.env.SITE_NAME || ''
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o',
        messages: [{ role: 'user', content: formattedPrompt }], // Envia o prompt formatado
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error("Erro ao gerar o relatório com o OpenRouter");
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      const generatedText = data.choices[0].message.content;
      return generatedText;
    } else {
      throw new Error("Formato de resposta inesperado da API do OpenRouter.");
    }
  } catch (error) {
    console.error("Erro ao gerar relatório com o OpenRouter:", error);
    throw new Error("Erro ao gerar relatório com o OpenRouter.");
  }
};

// Rota para gerar relatório
app.post("/generate-report", async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ message: "O prompt é obrigatório." });
  }

  try {
    const reportData = await generateReportWithOpenRouter(prompt); // Chama a função ajustada
    res.json({ report: reportData });
  } catch (error) {
    console.error('Erro ao gerar o relatório:', error);
    res.status(500).json({ message: "Erro ao gerar o relatório. Tente novamente mais tarde." });
  }
});

// 📝 Rota protegida /editor
app.get("/editor", authenticateToken, (req, res) => {
  res.json({ message: "Acesso ao Editor permitido", userId: req.user.userId });
});

// 📝 Rota protegida /csvUploader
app.get("/csvUploader", authenticateToken, (req, res) => {
  res.json({ message: "Acesso ao CSV Uploader permitido", userId: req.user.userId });
});

// Rota para verificar token
app.post("/verify-token", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({ message: "Token válido.", userId: decoded.userId });
  } catch (error) {
    res.status(401).json({ message: "Token inválido ou expirado." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
