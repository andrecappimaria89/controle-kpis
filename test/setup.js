// calc.js foi escrito para rodar no navegador (anexa tudo em window.KpiCalc).
// Para testar com o test runner nativo do Node, simulamos um `window` global
// minimo antes de carregar o arquivo - nenhuma linha do calc.js precisa mudar.
const path = require('path');

global.window = global.window || {};
require(path.join(__dirname, '..', 'public', 'js', 'calc.js'));

module.exports = global.window.KpiCalc;
