import request from 'supertest';
import { app } from '../app';

describe('CORS policy', () => {
  test.each(['http://localhost:3000', 'https://preview-branch-team.vercel.app'])('allows %s with credentials and standard methods', async (origin) => {
    const response = await request(app)
      .options('/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toEqual('GET,POST,PUT,DELETE,OPTIONS');
  });

  test('does not allow lookalike Vercel domains', async () => {
    const response = await request(app)
      .options('/auth/login')
      .set('Origin', 'https://vercel.app.attacker.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
