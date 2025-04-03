const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("./user.js");
const cookieParser = require("cookie-parser");
const authenticateToken = require("./authMiddleware.js");

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Conectado ao MongoDB"))
  .catch((err) => console.error("Erro ao conectar ao MongoDB:", err));

const generateReportWithDeepSeek = async (prompt) => {
  try {
    // Adiciona uma instrução fixa ao prompt para garantir que a resposta seja formatada em HTML
    const formattedPrompt = `
      Crie um conteúdo bem estruturado com títulos, subtítulos e parágrafos. Todos os elementos precisam ser formatados em HTML.
      O conteúdo gerado deve ser claro, com destaque para termos importantes, utilizando tags HTML como <h1>, <h2>, <p>, <strong>, <em>, etc.
      Em caso de gerar algum texto com alguma cor, use sempre este formato <span style="color: cor desejada"> mas com a cor que for definida abaixo.
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
        model: 'nvidia/llama-3.1-nemotron-70b-instruct:free',  // Modelo DeepSeek V3 0324
        messages: [{ role: 'user', content: formattedPrompt }], // Envia o prompt formatado
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error("Erro ao gerar o relatório com o DeepSeek");
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      const generatedText = data.choices[0].message.content;
      return generatedText;
    } else {
      throw new Error("Formato de resposta inesperado da API do DeepSeek.");
    }
  } catch (error) {
    console.error("Erro ao gerar relatório com o DeepSeek:", error);
    throw new Error("Erro ao gerar relatório com o DeepSeek.");
  }
};


// Rota para gerar relatório
app.post("/generate-report", async (req, res) => {
  const { prompt } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ message: "O prompt é obrigatório." });
  }

  try {
    const reportData = await generateReportWithDeepSeek(prompt); // Chama a função ajustada
    res.json({ report: reportData });
  } catch (error) {
    console.error('Erro ao gerar o relatório:', error);
    res.status(500).json({ message: "Erro ao gerar o relatório. Tente novamente mais tarde." });
  }
});

// 📝 Rota protegida /editor
app.get("/editor", authenticateToken, (req, res) => {
  try {
    // Aqui, o usuário já foi carregado e armazenado em `req.user` pelo middleware
    const user = req.user;

    // Verifica se o usuário existe antes de tentar acessar seus dados
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    // Retorna os dados do usuário com verificação para campos opcionais
    const userProfile = {
      message: "Acesso permitido",
      firstName: user.firstName || "Não informado",
      lastName: user.lastName || "Não informado",
      email: user.email || "Não informado",
      phone: user.phone || "Não informado", // Caso tenha esse campo
      cityState: user.cityState || "Não informado", // Caso tenha esse campo
      userType: user.userType || "Não informado",
    };

    res.json(userProfile);
  } catch (err) {
    console.error("Erro ao obter os dados do usuário:", err);
    return res.status(500).json({ message: "Erro ao obter dados do usuário", error: err.message });
  }
});

// 📝 Rota protegida /csvUploader
app.get("/csvUploader", authenticateToken, (req, res) => {
  res.json({ message: "Acesso ao CSV Uploader permitido", userId: req.user.userId });
});

// Rota para verificar token
app.post("/verify-token", async (req, res) => {
  console.log("Cookies recebidos:", req.cookies);
  console.log("Header Authorization:", req.headers.authorization);
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token não encontrado." });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Token inválido ou expirado." });
    }

    try {
      const user = await User.findById(decoded.userId).select("-password"); // Exclui a senha dos dados retornados

      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const userProfile = {
        message: "Acesso permitido",
        firstName: user.firstName || "Não informado",
        lastName: user.lastName || "Não informado",
        email: user.email || "Não informado",
        phone: user.phone || "Não informado", // Caso tenha esse campo
        cityState: user.cityState || "Não informado", // Caso tenha esse campo
        userType: user.userType || "Não informado",
      };

      res.status(200).json({ userProfile });
    } catch (error) {
      console.error("Erro ao buscar usuário:", error);
      res.status(500).json({ message: "Erro interno ao buscar usuário." });
    }
  });
});


app.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    domain: "https://meu-relatorio-backend.vercel.app", // Ajuste conforme necessário
  });

  res.status(200).json({ message: "Logout realizado com sucesso!" });
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

app.get("/test-db", async (req, res) => {
  try {
    await connectDB();
    const users = await User.find();
    res.json({ message: "Banco conectado!", users });
  } catch (error) {
    console.error("Erro ao conectar ao banco:", error);
    res.status(500).json({ message: "Erro ao conectar ao banco", error });
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

    const token = jwt.sign({ userId: user._id, userType: user.userType }, process.env.JWT_SECRET, { expiresIn: "1h" });
    console.log("Token gerado:", token);

    // Definir o cookie httpOnly
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "None", // Para permitir cookies entre domínios diferentes
      domain: "meu-relatorio-backend.vercel.app", // Especifique o domínio do backend
      path: "/", // Garante que o cookie esteja disponível em toda a API
      maxAge: 5 * 60 * 1000, // 5 minutos
    });

    // Responder com sucesso, sem enviar o token diretamente
    res.status(200).json({ token, message: "Login bem-sucedido" });
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

    // Verifica se o usuário existe antes de tentar acessar seus dados
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    // Retorna os dados do usuário com verificação para campos opcionais
    const userProfile = {
      message: "Acesso permitido",
      firstName: user.firstName || "Não informado",
      lastName: user.lastName || "Não informado",
      email: user.email || "Não informado",
      phone: user.phone || "Não informado", // Caso tenha esse campo
      cityState: user.cityState || "Não informado", // Caso tenha esse campo
      userType: user.userType || "Não informado",
    };

    res.json(userProfile);
  } catch (err) {
    console.error("Erro ao obter os dados do usuário:", err);
    return res.status(500).json({ message: "Erro ao obter dados do usuário", error: err.message });
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

module.exports = app;
