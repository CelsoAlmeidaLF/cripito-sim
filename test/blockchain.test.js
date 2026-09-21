const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sha256Sync,
  computeBlockHash,
  makeGenesisBlock,
  appendBlock,
  verifyChainIntegrity
} = require('../src/finance-engine.js');

test('Blockchain SHA-256 - Happy path: Gera hash consistente', () => {
  const hash1 = sha256Sync('hello world');
  const hash2 = sha256Sync('hello world');
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);
  assert.equal(hash1, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
});

test('Blockchain - Happy path: Criação do bloco gênese e encadeamento de blocos', () => {
  const genesis = makeGenesisBlock(1700000000000);
  assert.equal(genesis.index, 0);
  assert.equal(genesis.previousHash, '0'.repeat(64));
  assert.ok(genesis.hash && genesis.hash.length === 64);

  const chain = [genesis];
  const b1 = appendBlock(chain, { kind: 'deposit', amount: 500 }, 1700000001000);
  assert.equal(chain.length, 2);
  assert.equal(b1.index, 1);
  assert.equal(b1.previousHash, genesis.hash);

  const b2 = appendBlock(chain, { kind: 'trade', asset: 'btc', type: 'buy', value: 200 }, 1700000002000);
  assert.equal(chain.length, 3);
  assert.equal(b2.index, 2);
  assert.equal(b2.previousHash, b1.hash);

  const verification = verifyChainIntegrity(chain);
  assert.equal(verification.valid, true);
});

test('Blockchain - Negative path: Rejeição de adulteração de dados no meio da cadeia', () => {
  const genesis = makeGenesisBlock(1700000000000);
  const chain = [genesis];
  appendBlock(chain, { kind: 'deposit', amount: 1000 }, 1700000001000);
  appendBlock(chain, { kind: 'trade', asset: 'btc', type: 'buy', value: 300 }, 1700000002000);

  // Tentativa de fraude: alterar o valor do depósito de 1000 para 999999 sem atualizar o hash
  chain[1].data.amount = 999999;

  const result = verifyChainIntegrity(chain);
  assert.equal(result.valid, false);
  assert.equal(result.at, 1);
  assert.match(result.reason, /hash do bloco não confere/);
});

test('Blockchain - Negative path: Rejeição de quebra no previousHash', () => {
  const genesis = makeGenesisBlock(1700000000000);
  const chain = [genesis];
  appendBlock(chain, { kind: 'deposit', amount: 100 }, 1700000001000);
  appendBlock(chain, { kind: 'deposit', amount: 200 }, 1700000002000);

  // Tentativa de quebra de ponteiro
  chain[2].previousHash = 'a'.repeat(64);

  const result = verifyChainIntegrity(chain);
  assert.equal(result.valid, false);
  assert.equal(result.at, 2);
});

test('Blockchain - Negative path: Rejeição de cadeia vazia', () => {
  const result = verifyChainIntegrity([]);
  assert.equal(result.valid, false);
  assert.match(result.reason, /cadeia vazia/);
});
