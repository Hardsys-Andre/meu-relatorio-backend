require('dotenv').config();
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
console.log(process.env.OPENAI_API_KEY); // Verifique se a chave é exibida corretamente

export const generateReport = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4', // Use 'gpt-3.5-turbo' se preferir o gratuito
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return 'Houve um problema ao gerar o relatório. Tente novamente mais tarde.';
  }
};
