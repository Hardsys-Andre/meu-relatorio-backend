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

// 📝 Rota para cadastrar usuário
app.post("/register", async (req, res) => {
  const { firstName, lastName, phone, cityState, email, password } = req.body;

  if (!firstName || !lastName || !phone || !cityState || !email || !password) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      phone,
      cityState,
      email,
      password: hashedPassword,
      userType: 'Free',
    });

    await newUser.save();
    res.status(201).json({ message: "Usuário registrado com sucesso." });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    res.status(500).json({ message: "Erro ao registrar usuário." });
  }
});

// Rota para login e geração de token JWT
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Usuário não encontrado." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Senha incorreta." });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    // Retornar token e userType no login
    res.status(200).json({ token, userType: user.userType }); // Incluindo o userType na resposta
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).json({ message: "Erro ao fazer login." });
  }
});


// Rota protegida, usando o middleware para autenticação
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    // Aqui, o usuário já foi carregado e armazenado em `req.user` pelo middleware
    const user = req.user;

    // Retorna os dados do usuário
    res.json({
      message: "Acesso permitido",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone, // Caso tenha esse campo
      cityState: user.cityState, // Caso tenha esse campo
      userType: user.userType,
    });
  } catch (err) {
    console.error("Erro ao obter os dados do usuário:", err);
    return res.status(500).json({ message: "Erro ao obter dados do usuário" });
  }
});

// Rota protegida para editar dados do usuário
app.put("/profile/edit", authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phone, cityState } = req.body;
    const userId = req.user._id; // ID do usuário autenticado

    if (!firstName || !lastName || !phone || !cityState) {
      return res.status(400).json({ message: "Todos os campos são obrigatórios." });
    }

    // Atualiza o usuário no banco de dados
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, phone, cityState },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    res.status(200).json({ message: "Dados atualizados com sucesso.", user: updatedUser });
  } catch (error) {
    console.error("Erro ao atualizar os dados do usuário:", error);
    res.status(500).json({ message: "Erro ao atualizar os dados do usuário." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
