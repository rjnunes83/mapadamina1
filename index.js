const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// VARIÁVEIS DE AMBIENTE
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const PORT = process.env.PORT || 3000;

// FUNÇÃO PARA CRIAR OU ATUALIZAR PRODUTO NO SHOPIFY
async function upsertShopifyProduct(data) {
  try {
    const {
      id,
      name,
      slug,
      description,
      short_description,
      price,
      weight,
      images,
      tags,
      category_default
    } = data;

    const title = name || 'Produto Sem Título';
    const handle = slug || `produto-${id}`;
    const body_html = description || short_description || '';
    const tagsArray = tags ? tags.split(',').map(tag => tag.trim()) : [];
    const product_type = category_default?.name || 'Produto';
    const weightFloat = parseFloat(weight || 0.2);

    const imageObjects = images?.map(img => ({ src: img.url })) || [];

    const variant = {
      price: price?.toString() || '0.00',
      sku: id?.toString() || `sku-${Math.random()}`,
      inventory_management: 'shopify',
      inventory_quantity: 10,
      weight: weightFloat,
      weight_unit: 'kg'
    };

    const productData = {
      title,
      handle,
      body_html,
      product_type,
      tags: tagsArray,
      images: imageObjects,
      variants: [variant]
    };

    // Verifica se já existe um produto com esse handle
    const existing = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?handle=${handle}`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (existing.data.products.length > 0) {
      const productId = existing.data.products[0].id;

      await axios.put(`https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}.json`, {
        product: { id: productId, ...productData }
      }, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      console.log(`🔄 Produto atualizado: ${title} (ID Shopify: ${productId})`);
    } else {
      const response = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/products.json`, {
        product: productData
      }, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ Produto criado: ${title} (ID Shopify: ${response.data.product.id})`);
    }

  } catch (error) {
    console.error('❌ Erro ao criar/atualizar produto:', error.response?.data || error.message);
  }
}

// ROTA DO WEBHOOK DA BAGY
app.post('/webhook/produtos', async (req, res) => {
  const produto = req.body?.data;

  if (!produto || !produto.name || !produto.id) {
    console.log('⚠️ Webhook recebido com dados incompletos.');
    return res.status(400).send('Payload inválido');
  }

  console.log(`📦 Produto recebido da Bagy: ${produto.name}`);
  await upsertShopifyProduct(produto);
  res.status(200).send('Produto processado com sucesso');
});

// INÍCIO DO SERVIDOR
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
