// functions/lib/secret-manager.mjs
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import admin from 'firebase-admin';

const client = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || admin.app().options.projectId;

// 각 사용자의 시크릿 이름을 생성하는 규칙입니다. (예: user-gemini-api-key-사용자UID)
const getSecretName = (uid) => `user-gemini-api-key-${uid}`;

/**
 * 사용자의 API 키를 Secret Manager에 저장하거나 업데이트합니다.
 * @param {string} uid - 사용자 UID
 * @param {string} apiKey - 저장할 API 키 원본
 */
export async function setApiKeySecret(uid, apiKey) {
  const secretId = getSecretName(uid);

  try {
    // 1. 시크릿 '보관함'이 없으면 새로 만듭니다.
    await client.createSecret({
      parent: `projects/${PROJECT_ID}`,
      secretId: secretId,
      secret: { replication: { automatic: {} } },
    });
  } catch (e) {
    // 이미 시크릿이 존재하면 에러가 발생하지만, 정상적인 흐름이므로 무시합니다.
    if (e.code !== 6) { // 6 = ALREADY_EXISTS
      throw e;
    }
  }

  // 2. 시크릿에 새로운 버전(값)을 추가합니다.
  const [version] = await client.addSecretVersion({
    parent: `projects/${PROJECT_ID}/secrets/${secretId}`,
    payload: {
      data: Buffer.from(apiKey, 'utf8'),
    },
  });

  return version.name;
}

/**
 * Secret Manager에서 사용자의 API 키를 가져옵니다.
 * @param {string} uid - 사용자 UID
 * @returns {Promise<string|null>} API 키. 없으면 null.
 */
export async function getApiKeySecret(uid) {
  const secretId = getSecretName(uid);
  try {
    const [version] = await client.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/${secretId}/versions/latest`,
    });

    const apiKey = version.payload.data.toString('utf8');
    return apiKey;
  } catch (e) {
    // 시크릿이 존재하지 않는 경우 등
    if (e.code === 5) { // 5 = NOT_FOUND
      console.warn(`Secret not found for user: ${uid}`);
      return null;
    }
    // 그 외의 에러는 그대로 던져서 문제를 파악할 수 있게 합니다.
    console.error(`Failed to access secret for user ${uid}:`, e);
    throw new Error('SECRET_ACCESS_FAILED');
  }
}
