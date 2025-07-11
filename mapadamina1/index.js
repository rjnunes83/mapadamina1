require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para receber JSON
app.use(bodyParser.json());

// Endpoint de teste para homepage
app.get('/', (req, res) => {
  res.send('<p style="color:green;">🟢 Servidor de sincronização da Bagy está rodando com sucesso!</p>');
});

// Endpoint que recebe os dados do webhook da Bagy
app.post('/webhook/produtos', async (req, res) => {
  try {
    const produto = req.body;
    console.log("🛎️ Produto recebido da Bagy:", produto);

    // Monta os dados do produto no formato da API do Shopify
    const novoProduto = {
      product: {
        title: produto.nome || produto.title || "Produto sem título",
        body_html: produto.descricao || produto.description || "Descrição não informada.",
        vendor: produto.marca || "Bagy Mapa",
        product_type: produto.categoria || "Sem categoria",
        variants: [
          {
            price: produto.preco || "0.00",
            sku: produto.sku || "",
            inventory_management: "shopify",
            inventory_quantity: produto.estoque || 0,
          }
        ],
        images: produto.imagens?.length > 0 ? produto.imagens.map(url => ({ src: url })) : []
      }
    };

    // Envia o produto para o Shopify
    const response = await axios.post(
      `https://${process.env.SHOPIFY_DOMAIN}/admin/api/2024-04/products.json`,
      novoProduto,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Produto criado com sucesso no Shopify:', response.data);
    res.status(201).send({ sucesso: true, produtoShopify: response.data });
  } catch (erro) {
    console.error('❌ Erro ao criar produto no Shopify:', erro.response?.data || erro.message);
    res.status(500).send({ sucesso: false, erro: erro.message });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
