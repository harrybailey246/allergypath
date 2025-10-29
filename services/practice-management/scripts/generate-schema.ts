import { promises as fs } from 'fs';
import { join } from 'path';

async function main() {
  const source = join(__dirname, '..', 'src', 'graphql', 'schema.gql');
  const targetDir = join(__dirname, '..', 'generated');
  const target = join(targetDir, 'schema.gql');

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
