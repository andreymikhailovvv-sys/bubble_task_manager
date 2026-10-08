import jwt from 'jsonwebtoken';

export const AI_DOCUMENT_DOWNLOAD_PURPOSE = 'ai-generated-document-download' as const;
export const AI_DOCUMENT_DOWNLOAD_TTL_SECONDS = 5 * 60;

type AiDocumentDownloadToken = {
  documentId: string;
  userId: string;
  purpose: typeof AI_DOCUMENT_DOWNLOAD_PURPOSE;
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for generated document downloads');
  return secret;
};

export const signAiDocumentDownloadToken = (payload: Omit<AiDocumentDownloadToken, 'purpose'>) =>
  jwt.sign({ ...payload, purpose: AI_DOCUMENT_DOWNLOAD_PURPOSE }, getJwtSecret(), {
    expiresIn: AI_DOCUMENT_DOWNLOAD_TTL_SECONDS
  });

export const verifyAiDocumentDownloadToken = (token: string): AiDocumentDownloadToken => {
  const decoded = jwt.verify(token, getJwtSecret()) as Partial<AiDocumentDownloadToken>;
  if (
    decoded.purpose !== AI_DOCUMENT_DOWNLOAD_PURPOSE
    || typeof decoded.documentId !== 'string'
    || typeof decoded.userId !== 'string'
  ) {
    throw new Error('Invalid generated document download token');
  }
  return {
    documentId: decoded.documentId,
    userId: decoded.userId,
    purpose: decoded.purpose
  } as AiDocumentDownloadToken;
};
