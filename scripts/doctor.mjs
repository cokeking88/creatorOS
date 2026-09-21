const major = Number(process.versions.node.split('.')[0]);
const checks = [
  ['Node >= 22', major >= 22, process.versions.node],
  ['platform', true, `${process.platform}/${process.arch}`],
  ['CREATOROS_GATEWAY_TOKEN set', Boolean(process.env.CREATOROS_GATEWAY_TOKEN && process.env.CREATOROS_GATEWAY_TOKEN !== 'change-me'), process.env.CREATOROS_GATEWAY_TOKEN ? 'configured' : 'default/not loaded']
];
let failed = false;
for (const [name, ok, detail] of checks) { console.log(`${ok ? '✓' : '!' } ${name}: ${detail}`); if (name === 'Node >= 22' && !ok) failed = true; }
console.log('\nNext: npm install && npm run typecheck && npm run build');
process.exit(failed ? 1 : 0);
