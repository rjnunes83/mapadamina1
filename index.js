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
 * Atualiza o estoque da variante via SKU na Shopify
 */
async function updateShopifyVariantStock(sku, quantity) {
  if (!sku) return;
  try {
    // Busca variante por SKU
    const res = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/variants.json?sku=${encodeURIComponent(sku)}`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });
    if (!res.data.variants.length) {
      console.warn(`⚠️ Nenhuma variante encontrada na Shopify para SKU: ${sku}`);
      return;
    }

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
 * Função que extrai os nomes únicos dos atributos de todas as variantes do produto
 */
function getUniqueOptionNames(variations) {
  const attrs = [];
  variations.forEach(v => {
    if (v.attribute && v.attribute.attribute_name && !attrs.includes(v.attribute.attribute_name)) {
      attrs.push(v.attribute.attribute_name);
    }
    if (v.attribute_secondary && v.attribute_secondary.attribute_name && !attrs.includes(v.attribute_secondary.attribute_name)) {
      attrs.push(v.attribute_secondary.attribute_name);
    }
    // Adicione aqui para um 3º atributo se houver
  });
  return attrs.slice(0, 3); // Shopify suporta até 3 opções
}

/**
 * Gera o array "options" no formato da Shopify
 */
function buildShopifyOptions(variations) {
  const optionNames = getUniqueOptionNames(variations);
  return optionNames.length > 0
    ? optionNames.map(optionName => ({
        name: optionName,
        values: [
          ...new Set(
            variations.map(v =>
              v.attribute && v.attribute.attribute_name === optionName
                ? v.attribute.name
                : v.attribute_secondary && v.attribute_secondary.attribute_name === optionName
                ? v.attribute_secondary.name
                : undefined
            ).filter(Boolean)
          )
        ]
      }))
    : [{ name: 'Title', values: ['Default Title'] }];
}

/**
 * Para cada variante, monta as opções com base nos atributos, e mapeia o SKU
 */
function buildShopifyVariants(variations, productData) {
  const optionNames = getUniqueOptionNames(variations);
  return variations.map(variation => {
    let options = [];
    optionNames.forEach(optionName => {
      let value = null;
      if (variation.attribute && variation.attribute.attribute_name === optionName) {
        value = variation.attribute.name;
      }
      if (variation.attribute_secondary && variation.attribute_secondary.attribute_name === optionName) {
        value = variation.attribute_secondary.name;
      }
      options.push(value || 'Default Title');
    });
    while (options.length < 3) options.push(null);

    return {
      option1: options[0],
      option2: options[1],
      option3: options[2],
      price: (variation.price || productData.price || 0.00).toString(),
      sku: (variation.reference || '').trim() || (variation.sku || variation.id?.toString() || ''),
      inventory_management: 'shopify',
      inventory_quantity: variation.balance || 0,
      weight: parseFloat(variation.weight || productData.weight || 0.1),
      weight_unit: 'kg',
    };
  });
}

// Função principal para upload/atualização de produto completo
async function upsertProductInShopify(productData) {
  try {
    const title = productData.name || 'Produto sem nome';
    const handle = (productData.slug || title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '')).substring(0, 50);
    const description = productData.description || productData.short_description || '';
    const vendor = (productData.brand?.name || productData.vendor || 'Biju & Cia.').toString();
    const productType = productData.category_default?.name || 'Produto';
    const tags = productData.tags ? productData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const images = productData.images?.map(img => ({ src: img.src || img.url })) || [];

    let options = [];
    let variants = [];

    if (productData.variations && Array.isArray(productData.variations) && productData.variations.length > 0) {
      options = buildShopifyOptions(productData.variations);
      variants = buildShopifyVariants(productData.variations, productData);
    } else {
      // Produto sem variação
      options = [{ name: "Title", values: ["Default Title"] }];
      variants = [{
        option1: "Default Title",
        price: (productData.price || 0.00).toString(),
        sku: (productData.reference || productData.id?.toString() || "SKU-UNICO"),
        inventory_management: 'shopify',
        inventory_quantity: productData.stock || 0,
        weight: parseFloat(productData.weight || 0.1),
        weight_unit: 'kg',
      }];
    }

    const shopifyProduct = {
      title,
      handle,
      body_html: description,
      vendor,
      product_type: productType,
      tags,
      images,
      status: 'active',
      published: true,
      variants,
      options,
      metafields: [
        {
          namespace: 'global',
          key: 'seo_title',
          value: title,
          type: 'single_line_text_field'
        },
        {
          namespace: 'global',
          key: 'seo_description',
          value: description.replace(/<[^>]*>?/gm, '').substring(0, 320),
          type: 'multi_line_text_field'
        }
      ]
    };

    // Verifica se o produto já existe por handle
    const res = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?handle=${handle}`, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });

    if (res.data.products.length > 0) {
      const productId = res.data.products[0].id;
      await axios.put(`https://${SHOPIFY_STORE}/admin/api/2024-01/products/${productId}.json`, {
        product: { id: productId, ...shopifyProduct }
      }, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      console.log(`🔄 Produto atualizado: ${title}`);
    } else {
      const created = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/products.json`, {
        product: shopifyProduct
      }, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      console.log(`✅ Produto criado: ${title} (ID Shopify: ${created.data.product.id})`);
    }

  } catch (error) {
    console.error('❌ Erro ao criar/atualizar produto:', error?.response?.data || error.message);
  }
}

// ROTA ÚNICA PARA TODOS OS EVENTOS
app.post('/webhook/produtos', async (req, res) => {
  try {
    console.log("====== PAYLOAD COMPLETO RECEBIDO DA BAGY ======");
    console.log(JSON.stringify(req.body, null, 2));

    const data = req.body?.data;
    if (!data) return res.status(400).send('Payload inválido.');

    // Se for apenas atualização de estoque de uma variante (não é produto completo)
    if ((!data.name && !data.slug) && (data.reference || data.sku)) {
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

// ROTA PARA MONITORAMENTO (UPTIME ROBOT / RENDER)
app.get('/', (req, res) => {
  res.send('Servidor online! 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor online na porta ${PORT}`);
});