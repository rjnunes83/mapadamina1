const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

// CONFIG
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN || 'revenda-biju.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || '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';
const PORT = process.env.PORT || 3000;

/**
 * Atualiza estoque da variante via SKU na Shopify
 */
async function updateShopifyVariantStock(sku, quantity) {
  if (!sku) return;
  try {
    // Busca variante por SKU
    const res = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/variants.json?sku=${encodeURIComponent(sku)}`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });
    if (!res.data.variants.length) return;

    const variant = res.data.variants[0];
    const inventoryItemId = variant.inventory_item_id;

    // Busca o primeiro location_id
    const locRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/locations.json`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });
    const locationId = locRes.data.locations[0].id;

    // Atualiza o estoque
    await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/inventory_levels/set.json`, {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity
    }, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });

    console.log(`🔄 Estoque da variante SKU ${sku} atualizado para ${quantity}`);
  } catch (err) {
    console.error('❌ Erro ao atualizar estoque:', err.response?.data || err.message);
  }
}

/**
 * Demais funções de manipulação do produto (igual ao seu index.js)
 * ...
 * [coloque aqui suas funções buildShopifyOptions, buildShopifyVariants etc.]
 * ...
 */

// Função principal para upload/atualização de produto (igual ao seu código)
async function upsertProductInShopify(productData) {
  // ... (seu código buildShopifyProduct etc.)
  // ... igual ao que já funciona hoje
}

// ROTA ÚNICA PARA TODOS OS EVENTOS
app.post('/webhook/produtos', async (req, res) => {
  try {
    console.log("====== PAYLOAD COMPLETO RECEBIDO DA BAGY ======");
    console.log(JSON.stringify(req.body, null, 2));

    const data = req.body?.data;
    if (!data) return res.status(400).send('Payload inválido.');

    // --- ATENÇÃO: Verifica se é variante simples (estoque) ou produto completo ---
    // Caso seja evento de variante sem dados do produto
    if ((!data.name && !data.slug) && (data.reference || data.sku)) {
      // Atualiza apenas o estoque da variante
      const sku = (data.reference || data.sku || '').toString();
      const qty = data.balance ?? 0;
      await updateShopifyVariantStock(sku, qty);
      return res.status(200).send('Estoque da variante atualizado.');
    }

    // Produto completo: faz upsert normal
    console.log("📦 Produto recebido da Bagy:", data.name || data.slug || '[sem nome]');
    await upsertProductInShopify(data);
    res.status(200).send('Produto processado com sucesso.');
  } catch (err) {
    console.error('❌ Erro no processamento do webhook:', err.message);
    res.status(500).send('Erro interno.');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor online na porta ${PORT}`);
});