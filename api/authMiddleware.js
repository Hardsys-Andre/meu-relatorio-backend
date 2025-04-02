const jwt = require("jsonwebtoken");
const User = require("./user.js");

const authMiddleware = async (req, res, next) => {
  // Verifica se o token foi fornecido no cabeçalho Authorization
  const token = req.headers["authorization"];
  
  // Se não houver token, retorna erro 403
  if (!token) {
    return res.status(403).json({ message: "Token não fornecido" });
  }

  // Verifica se o token contém o prefixo "Bearer " e o remove
  if (!token.startsWith("Bearer ")) {
    return res.status(400).json({ message: "Token mal formatado" });
  }
  const tokenWithoutBearer = token.slice(7); // Remove 'Bearer ' de forma mais segura

  try {
    // Decodifica o token e valida
    const decoded = jwt.verify(tokenWithoutBearer, process.env.JWT_SECRET);

    // Tenta encontrar o usuário correspondente ao ID decodificado
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    // Adiciona o usuário à requisição
    req.user = user;
    
    // Passa para o próximo middleware ou rota
    next();
  } catch (err) {
    // Se o token for inválido ou outro erro ocorrer
    console.error("Erro ao verificar token:", err);
    return res.status(401).json({ message: "Token inválido ou expirado" });
  }
};

module.exports = authMiddleware;
