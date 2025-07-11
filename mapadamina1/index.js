const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

// CONFIG
const SHOPIFY_STORE = process.env.SHOPIFY_DOMAIN || 'revenda-biju.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || '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';
const PORT = process.env.PORT || 3000;

// Função para gerar opções dinamicamente a partir das variantes
function generateOptionsFromVariants(variants) {
  const optionNames = ['option1', 'option2', 'option3'];
  const options = [];
  optionNames.forEach((optKey, i) => {
    const values = variants.map(v => v[optKey]).filter(Boolean);
    if (values.length > 0 && new Set(values).size > 1) {
      options.push({ name: `Opção ${i + 1}`, values: [...new Set(values)] });
    }
  });
  if (options.length === 0) options.push({ name: 'Título', values: ['Única'] });
  return options;
}

// Função principal para upload/atualização
async function upsertProductInShopify(productData) {
  try {
    const title = productData.name || 'Produto sem nome';
    const handle = (productData.slug || title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '')).substring(0, 50);
    const description = productData.description || productData.short_description || '';
    const vendor = (productData.vendor || 'Biju & Cia.').toString();
    const productType = productData.category_default?.name || 'Produto';
    const tags = productData.tags ? productData.tags.split(',').map(t => t.trim()) : [];
    const images = productData.images?.map(img => ({ src: img.url })) || [];

    // Variantes
    let variants = [];
    if (productData.variations && Array.isArray(productData.variations) && productData.variations.length > 0) {
      variants = productData.variations.map((variation, idx) => ({
        option1: variation.option1 || variation.name || `Variante ${idx + 1}` || `Única ${Date.now()}`,
        option2: variation.option2 || null,
        option3: variation.option3 || null,
        price: (variation.price || productData.price || 0.00).toString(),
        sku: variation.sku || variation.id?.toString() || `${productData.id || ''}-${idx}`,
        inventory_management: 'shopify',
        inventory_quantity: variation.stock || 0,
        weight: parseFloat(variation.weight || productData.weight || 0.1),
        weight_unit: 'kg',
      }));
    } else {
      variants = [{
        option1: `Única - ${handle}-${Date.now()}`,
        price: (productData.price || 0.00).toString(),
        sku: productData.id?.toString() || `SKU-${handle}-${Date.now()}`,
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
      options: generateOptionsFromVariants(variants),
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
          value: description.substring(0, 320),
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

// ROTA ÚNICA PARA OS 3 EVENTOS
app.post('/webhook/produtos', async (req, res) => {
  try {
    const data = req.body?.data;
    if (!data) return res.status(400).send('Payload inválido.');

    console.log("📦 Produto recebido da Bagy:", data.name || data.slug || '[sem nome]');
    await upsertProductInShopify(data);
    res.status(200).send('Produto processado com sucesso.');
  } catch (err) {
    console.error('❌ Erro no processamento do webhook:', err.message);
    res.status(500).send('Erro interno.');
  }
});

// INICIA SERVIDOR
app.listen(PORT, () => {
  console.log(`🚀 Servidor online na porta ${PORT}`);
});