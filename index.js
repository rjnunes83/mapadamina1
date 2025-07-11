require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para receber JSON
app.use(bodyParser.json());

// Rota de recebimento do webhook
app.post('/webhook/produtos', async (req, res) => {
  const produto = req.body;

  console.log("📦 Produto recebido da Bagy:", produto);

  // Aqui você pode fazer a lógica de sincronização com a API do Shopify
  // Exemplo: Enviar o produto para sua loja Shopify via API

  try {
    const response = await axios.post(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2023-07/products.json`,
      {
        product: {
          title: produto.nome,
          body_html: produto.descricao || '',
          vendor: "Mapa da Mina",
          product_type: produto.categoria || '',
          variants: [
            {
              price: produto.preco,
              sku: produto.sku,
              inventory_quantity: produto.estoque || 0
            }
          ],
          images: [
            {
              src: produto.imagem || '' // URL da imagem vinda da Bagy
            }
          ]
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ Produto enviado para Shopify:", response.data);
    res.status(200).send('OK');
  } catch (error) {
    console.error("❌ Erro ao enviar para Shopify:", error.response?.data || error.message);
    res.status(500).send('Erro ao sincronizar produto.');
  }
});

// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
