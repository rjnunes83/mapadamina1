require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para receber JSON
app.use(bodyParser.json());

// Rota GET para confirmar que o servidor está no ar
app.get('/', (req, res) => {
  res.send('🟢 Servidor de sincronização da Bagy está rodando com sucesso!');
});

// Rota de recebimento do webhook
app.post('/webhook/produtos', async (req, res) => {
  const produto = req.body;

  console.log("📦 Produto recebido da Bagy:", produto);

  // Aqui você pode fazer a lógica de sincronização com a API do Shopify
  // Exemplo: Enviar o produto para sua loja Shopify via API

  res.status(200).json({ status: 'Recebido com sucesso' });
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
