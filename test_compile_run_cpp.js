const os = require('os');
const ADDITIONAL_PATHS = [
  'C:\\Program Files\\nodejs',
  'C:\\Program Files (x86)\\Dev-Cpp\\MinGW64\\bin',
  'C:\\Program Files\\Dev-Cpp\\MinGW64\\bin',
  'C:\\MinGW\\bin',
  'C:\\msys64\\mingw64\\bin',
  'C:\\Python312',
  'C:\\Python311',
  'C:\\Python310',
  `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python312`,
  `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python311`,
  `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python310`,
];

const filteredPath = (process.env.PATH || '')
  .split(';')
  .filter(p => !p.toLowerCase().includes('windowsapps'))
  .join(';');

process.env.PATH = `${ADDITIONAL_PATHS.join(';')};${filteredPath}`;

const { cpp } = require('compile-run');
const code = `
#include <iostream>
using namespace std;
int main() {
  int a, b;
  if (cin >> a >> b) {
    cout << "Sum is " << (a + b) << endl;
  } else {
    cout << "Failed to read inputs" << endl;
  }
  return 0;
}
`;
cpp.runSource(code, { stdin: '12 34' })
  .then(res => console.log('C++ result:', res))
  .catch(err => console.error('C++ error:', err));
