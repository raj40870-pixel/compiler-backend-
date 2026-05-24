const { node } = require('compile-run');
const code = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Name? ', (name) => {
  console.log('Hello ' + name);
  rl.close();
});
`;
node.runSource(code, { stdin: 'Antigravity' })
  .then(res => console.log('Node result with stdin:', res))
  .catch(err => console.error('Node error:', err));
