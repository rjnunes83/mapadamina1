const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const Bottleneck = require('bottleneck');
const app = express();
app.use(bodyParser.json());

// CONFIG
env:
// SHOPIFY_STORE, SHOPIFY_TOKEN, PORT
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN || 'revenda-biju.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || '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';
const PORT = process.env.PORT || 3000;

// Throttler: até 2 requisições por segundo
const limiter = new Bottleneck({
  minTime: 500 // 500ms entre chamadas = 2 req/s
});

// Função de retry exponencial em caso de 429
async function retry(fn, retries = 5, delay = 500) {
  try {
    return await fn();
  } catch (err) {
    const status = err.response?.status;
    if (status === 429 && retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return retry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

/**
 * Atualiza o estoque da variante via SKU na Shopify
 */
async function updateShopifyVariantStock(sku, quantity) {
  if (!sku) return;
  try {
    // Busca variante por SKU
    const res = await limiter.schedule(() => retry(() => axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/variants.json?sku=${encodeURIComponent(sku)}`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    )));

    if (!res.data.variants.length) {
      console.warn(`⚠️ Nenhuma variante encontrada na Shopify para SKU: ${sku}`);
      return;
    }
    const variant = res.data.variants[0];
    const inventoryItemId = variant.inventory_item_id;

    // Busca o primeiro location_id
    const locRes = await limiter.schedule(() => retry(() => axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/locations.json`,
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    )));
    const locationId = locRes.data.locations[0].id;

    // Atualiza o estoque
    await limiter.schedule(() => retry(() => axios.post(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/inventory_levels/set.json`,
      { location_id: locationId, inventory_item_id: inventoryItemId, available: quantity },
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
    )));

    console.log(`🔄 Estoque da variante SKU ${sku} atualizado para ${quantity}`);
  } catch (err) {
    console.error('❌ Erro ao atualizar estoque:', err.response?.data || err.message);
  }
}

// ... (outras funções buildShopifyOptions, buildShopifyVariants permanecem inalteradas) ...

// Insira aqui as funções getUniqueOptionNames, buildShopifyOptions, buildShopifyVariants, upsertProductInShopify sem alteração

// ROTA ÚNICA PARA TODOS OS EVENTOS
app.post('/webhook/produtos', async (req, res) => {
  try {
    console.log("====== PAYLOAD COMPLETO RECEBIDO DA BAGY ======");
    console.log(JSON.stringify(req.body, null, 2));

    const data = req.body?.data;
    if (!data) return res.status(400).send('Payload inválido.');

    // Atualização de estoque de variante
    if ((!data.name && !data.slug) && (data.reference || data.sku)) {
      const sku = (data.reference || data.sku || '').toString();
      const qty = data.balance ?? 0;
      await updateShopifyVariantStock(sku, qty);
      return res.status(200).send('Estoque da variante atualizado.');
    }

    // Produto completo
    console.log("📦 Produto recebido da Bagy:", data.name || data.slug || '[sem nome]');
    await upsertProductInShopify(data);
    return res.status(200).send('Produto processado com sucesso.');
  } catch (err) {
    console.error('❌ Erro no processamento do webhook:', err.message);
    return res.status(500).send('Erro interno.');
  }
});

// ROTA PARA MONITORAMENTO (UPTIME ROBOT / RENDER)
app.get('/', (req, res) => res.send('Servidor online! 🚀'));

app.listen(PORT, () => console.log(`🚀 Servidor online na porta ${PORT}`));
