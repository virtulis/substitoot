import { readFile, writeFile } from 'fs/promises';

const template = await readFile('web/template.html', 'utf8');
const readme = await readFile('web/readme.html', 'utf8');
const logo = await readFile('static/logo.svg', 'utf8');

const index = template.replace(/\t*##LOGO##/, logo).replace(/\t*##README##/, readme);
await writeFile('web/index.html', index);
