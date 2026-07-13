import Fastify from 'fastify';
import path from 'node:path';
import fastifyStatic from '@fastify/static';

const fastify = Fastify({
  logger: true
});

// Registrar o plugin static apontando para a pasta /KALINE/codice
fastify.register(fastifyStatic, {
  root: '/KALINE/codice',
  prefix: '/', // Isso significa que /KALINE/codice/epub ficará acessível em /epub
  list: true, // Mostra o índice dos arquivos se acessar a raiz da pasta
  cors: true // Permite que seu Web App no celular chame os arquivos (CORS)
});

// Liberar o CORS global para caso seu web app leia de outro IP/porta
fastify.addHook('onRequest', (request, reply, done) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  reply.header('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Encoding, Content-Length, Content-Range');
  done();
});

// Tratamento de requisição OPTIONS para o CORS
fastify.options('/*', (request, reply) => {
  reply.send();
});

const start = async () => {
  try {
    // Escutando na porta 8080 em 0.0.0.0 (todas as interfaces, incluindo o Tailscale)
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Servidor de Códice rodando em http://100.85.199.107:8080');
    console.log('Use http://100.85.199.107:8080/epub para acessar seus Epubs.');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
