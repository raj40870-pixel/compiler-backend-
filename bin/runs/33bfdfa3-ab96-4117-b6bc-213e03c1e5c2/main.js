const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Enter number: ', (ans) => {
  console.log('You entered: ' + ans);
  rl.close();
});