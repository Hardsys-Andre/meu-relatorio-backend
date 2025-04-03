const jwt = require("jsonwebtoken");
const User = require("./user.js");
const connectDB = require("../db.js");

const authMiddleware = async (req, res, next) => {
  await connectDB(); // Conectar ao MongoDB antes de buscar o usuário

  const token = req.headers["authorization"];
  if (!token) {
    return res.status(403).json({ message: "Token não fornecido" });
  }

  if (!token.startsWith("Bearer ")) {
    return res.status(400).json({ message: "Token mal formatado" });
  }

  const tokenWithoutBearer = token.slice(7);

  try {
    const decoded = jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Erro ao verificar token:", err);
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
};

module.exports = authMiddleware;
