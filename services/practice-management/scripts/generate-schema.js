const fs = require('fs').promises;
const path = require('path');

async function main() {
  const source = path.join(__dirname, '..', 'src', 'graphql', 'schema.gql');
  const targetDir = path.join(__dirname, '..', 'generated');
  const target = path.join(targetDir, 'schema.gql');

  await fs.mkdir(targetDir, { recursive: true });
  const schema = await fs.readFile(source, 'utf8');
  await fs.writeFile(target, schema, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`GraphQL schema copied to ${target}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
