/** True when origin matches a *.vercel.app, *.onrender.com, or *.catalystappsail.in wildcard */
export declare function isWildcardAllowed(origin: string): boolean;
export declare const config: {
    port: number;
    isCatalystRuntime: boolean;
    nodeEnv: string;
    backendUrl: string;
    jwtSecret: string;
    jwtExpiresIn: string;
    frontendUrl: string;
    allowedOrigins: string[];
    databaseUrl: string | undefined;
    rapidApi: {
        key: string;
        host: string;
        pnrUrl: string;
    };
};
export default config;
//# sourceMappingURL=index.d.ts.map