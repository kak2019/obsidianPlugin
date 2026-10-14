import { requestUrl, type RequestUrlResponse } from 'obsidian';

function readBodyMessage(response: RequestUrlResponse): string {
	const fallback = response.text?.slice(0, 300) || `HTTP ${response.status}`;
	try {
		const body = response.json as {
			error?: { message?: string } | string;
			message?: string;
		};
		if (typeof body.error === 'string' && body.error) {
			return body.error;
		}
		if (body.error && typeof body.error === 'object' && body.error.message) {
			return body.error.message;
		}
		if (typeof body.message === 'string' && body.message) {
			return body.message;
		}
	} catch {
		return fallback;
	}
	return fallback;
}

export async function postJson(
	url: string,
	headers: Record<string, string>,
	body: unknown,
): Promise<unknown> {
	let response: RequestUrlResponse;
	try {
		response = await requestUrl({
			url,
			method: 'POST',
			throw: false,
			headers: {
				'Content-Type': 'application/json',
				...headers,
			},
			body: JSON.stringify(body),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : '网络请求失败';
		throw new Error(message);
	}

	if (response.status < 200 || response.status >= 300) {
		throw new Error(readBodyMessage(response));
	}

	try {
		return response.json;
	} catch {
		throw new Error('接口没有返回 JSON。');
	}
}
