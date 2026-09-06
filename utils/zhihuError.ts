function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getZhihuErrorMessage(error: unknown): string {
  if (isRecord(error) && isRecord(error.response)) {
    const data = error.response.data;
    if (isRecord(data) && isRecord(data.error)) {
      const message = data.error.message;
      if (typeof message === 'string' && message) return message;
    }
    if (isRecord(data)) {
      const message = data.message;
      if (typeof message === 'string' && message) return message;
    }
  }

  if (error instanceof Error && error.message) return error.message;

  return '未知错误';
}
