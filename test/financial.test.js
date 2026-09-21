const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeCashBalance,
  computeSummary,
  computeTaxMonthSummary,
  calculateDCASimulation
} = require('../src/finance-engine.js');

test('Cálculo de Saldo em Caixa - Happy path: Depósito, compra e venda', () => {
  const deposits = [{ amount: 1000 }];
  const trades = [
    { type: 'buy', value: 400 },
    { type: 'sell', value: 200 }
  ];

  // Esperado: 1000 - 400 + 200 = 800
  const balance = computeCashBalance(deposits, trades);
  assert.equal(balance, 800);
});

test('Cálculo de Saldo em Caixa - Negative path: Compras sem depósito deixam saldo negativo', () => {
  const deposits = [];
  const trades = [{ type: 'buy', value: 500 }];
  const balance = computeCashBalance(deposits, trades);
  assert.equal(balance, -500);
});

test('Resumo da Carteira - Happy path: Custo médio ponderado e lucro realizado', () => {
  const assetKeys = ['btc', 'eth'];
  const trades = [
    // Compra 1: 1 BTC a $20.000 = $20.000
    { timestamp: 1000, asset: 'btc', type: 'buy', qty: 1, price: 20000 },
    // Compra 2: 1 BTC a $30.000 = $30.000. Total 2 BTC por $50.000 (PM = $25.000)
    { timestamp: 2000, asset: 'btc', type: 'buy', qty: 1, price: 30000 },
    // Venda de 1 BTC a $35.000. Custo da parcela vendida: $25.000. Lucro = $10.000
    { timestamp: 3000, asset: 'btc', type: 'sell', qty: 1, price: 35000 }
  ];

  const prices = { btc: 40000, eth: 2000 };
  const summary = computeSummary(assetKeys, trades, prices);
  const btcSummary = summary.perAsset.btc;

  assert.equal(btcSummary.boughtQty, 1);
  assert.equal(btcSummary.avgCost, 25000);
  assert.equal(btcSummary.realized, 10000);
  // Valor atual do 1 BTC restante a $40.000
  assert.equal(btcSummary.currentValue, 40000);
  // Lucro não realizado do BTC restante: 40.000 - 25.000 = 15.000
  assert.equal(btcSummary.unrealized, 15000);
});

test('IRPF Cripto (IN 1888) - Happy path: Isenção abaixo de R$ 35.000', () => {
  const assetKeys = ['btc'];
  const brlRate = 5.0; // 1 USD = R$ 5,00
  const trades = [
    { timestamp: new Date('2026-09-02T10:00:00Z').getTime(), asset: 'btc', type: 'buy', qty: 1, price: 20000, fee: 0 },
    // Venda de $5.000 USD * 5.0 = R$ 25.000 BRL (abaixo do limite de R$ 35.000)
    { timestamp: new Date('2026-09-15T12:00:00Z').getTime(), asset: 'btc', type: 'sell', qty: 0.2, price: 25000, fee: 0 }
  ];

  const tax = computeTaxMonthSummary(assetKeys, trades, '2026-09', brlRate);
  assert.equal(tax.totalAlienationBRL, 25000);
  assert.equal(tax.isExempt, true);
  assert.equal(tax.taxEstimatedBRL, 0);
  assert.equal(tax.monthSales.length, 1);
});

test('IRPF Cripto (IN 1888) - Negative path: Ultrapassando R$ 35.000 gera imposto sobre ganho de capital', () => {
  const assetKeys = ['btc'];
  const brlRate = 5.0;
  const trades = [
    // Compra 1 BTC a $20.000
    { timestamp: new Date('2026-09-01T10:00:00Z').getTime(), asset: 'btc', type: 'buy', qty: 1, price: 20000, fee: 0 },
    // Vende 1 BTC a $30.000 (Alienação = $30.000 * 5 = R$ 150.000, Lucro = $10.000 * 5 = R$ 50.000)
    { timestamp: new Date('2026-09-20T10:00:00Z').getTime(), asset: 'btc', type: 'sell', qty: 1, price: 30000, fee: 0 }
  ];

  const tax = computeTaxMonthSummary(assetKeys, trades, '2026-09', brlRate);
  assert.equal(tax.totalAlienationBRL, 150000);
  assert.equal(tax.isExempt, false);
  assert.equal(tax.totalRealizedGainBRL, 50000);
  // 15% sobre o ganho de capital de R$ 50.000 = R$ 7.500
  assert.equal(tax.taxEstimatedBRL, 7500);
});

test('Simulador DCA - Happy path: Gera projeção correta de aportes periódicos', () => {
  // $100/mês por 12 meses (12 aportes de $100 = $1200 investidos)
  const dca = calculateDCASimulation(50000, 100, 30, 12, 5);
  assert.equal(dca.totalInvestedUSD, 1200);
  assert.ok(dca.accumulatedCoins > 0);
  assert.ok(dca.finalValueUSD > 0);
  assert.ok(dca.avgCostUSD > 0);
});
