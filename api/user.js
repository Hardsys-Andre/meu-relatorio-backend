const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phone: String,
  cityState: String,
  email: { type: String, unique: true },
  password: String,
  userType: String,
});

module.exports = mongoose.model("User", userSchema);
