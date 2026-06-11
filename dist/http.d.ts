export interface HttpResponse {
    text: string;
    ok: boolean;
    status: number;
    url: string;
}
export interface HttpClient {
    get(url: string): Promise<HttpResponse>;
    head(url: string): Promise<HttpResponse>;
}
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Pick<Response, "text" | "ok" | "status" | "url">>;
export declare function createFetchClient(fetchImpl?: FetchLike): HttpClient;
export {};
//# sourceMappingURL=http.d.ts.map