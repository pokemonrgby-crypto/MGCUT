// functions/lib/secret-manager.mjs
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import admin from 'firebase-admin';

const client = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || admin.app().options.projectId;

const getSecretName = (uid) => `user-gemini-api-key-${uid}`;

export async function setApiKeySecret(uid, apiKey) {
  const secretId = getSecretName(uid);
  try {
    await client.createSecret({
      parent: `projects/${PROJECT_ID}`,
      secretId: secretId,
      secret: { replication: { automatic: {} } },
    });
  } catch (e) {
    if (e.code !== 6) { // ALREADY_EXISTS
      throw e;
    }
  }
  const [version] = await client.addSecretVersion({
    parent: `projects/${PROJECT_ID}/secrets/${secretId}`,
    payload: {
      data: Buffer.from(apiKey, 'utf8'),
    },
  });
  return version.name;
}

export async function getApiKeySecret(uid) {
  const secretId = getSecretName(uid);
  try {
    const [version] = await client.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${secretId}/versions/latest`,
    });
    return version.payload.data.toString('utf8');
  } catch (e) {
    if (e.code === 5) { // NOT_FOUND
      console.warn(`Secret not found for user: ${uid}`);
      return null;
    }
    console.error(`Failed to access secret for user ${uid}:`, e);
    throw new Error('SECRET_ACCESS_FAILED');
  }
}
