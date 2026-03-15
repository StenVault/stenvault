/**
 * OPAQUE Client Tests
 *
 * Tests the zero-knowledge authentication wrapper:
 * - Registration flow (start → finish)
 * - Login flow (start → finish)
 * - WASM initialization
 * - Wrong password returns undefined (not error)
 * - Return value shape validation
 * - Full integration round-trip with real WASM
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must hoist mock values since vi.mock factory is hoisted
const { mockClient, readyPromise } = vi.hoisted(() => {
    const mockClient = {
        startRegistration: vi.fn(),
        finishRegistration: vi.fn(),
        startLogin: vi.fn(),
        finishLogin: vi.fn(),
    };
    // Immediately resolved for unit tests
    const readyPromise = Promise.resolve();
    return { mockClient, readyPromise };
});

vi.mock('@serenity-kit/opaque', () => ({
    ready: readyPromise,
    client: mockClient,
}));

import {
    startRegistration,
    finishRegistration,
    startLogin,
    finishLogin,
} from './opaqueClient';

describe('OPAQUE Client (unit)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ============ startRegistration ============

    describe('startRegistration', () => {
        it('should return clientRegistrationState and registrationRequest', async () => {
            mockClient.startRegistration.mockReturnValue({
                clientRegistrationState: 'state_abc',
                registrationRequest: 'request_xyz',
            });

            const result = await startRegistration('myPassword');

            expect(result.clientRegistrationState).toBe('state_abc');
            expect(result.registrationRequest).toBe('request_xyz');
        });

        it('should pass password to opaque client', async () => {
            mockClient.startRegistration.mockReturnValue({
                clientRegistrationState: 's',
                registrationRequest: 'r',
            });

            await startRegistration('secret123');

            expect(mockClient.startRegistration).toHaveBeenCalledWith({
                password: 'secret123',
            });
        });
    });

    // ============ finishRegistration ============

    describe('finishRegistration', () => {
        it('should return registrationRecord, exportKey, serverStaticPublicKey', async () => {
            mockClient.finishRegistration.mockReturnValue({
                registrationRecord: 'record_data',
                exportKey: 'export_key_data',
                serverStaticPublicKey: 'server_pk',
            });

            const result = await finishRegistration('pass', 'state', 'response');

            expect(result.registrationRecord).toBe('record_data');
            expect(result.exportKey).toBe('export_key_data');
            expect(result.serverStaticPublicKey).toBe('server_pk');
        });

        it('should pass all params to opaque client', async () => {
            mockClient.finishRegistration.mockReturnValue({
                registrationRecord: 'r',
                exportKey: 'e',
                serverStaticPublicKey: 's',
            });

            await finishRegistration('pass', 'my_state', 'srv_response');

            expect(mockClient.finishRegistration).toHaveBeenCalledWith({
                password: 'pass',
                clientRegistrationState: 'my_state',
                registrationResponse: 'srv_response',
            });
        });
    });

    // ============ startLogin ============

    describe('startLogin', () => {
        it('should return clientLoginState and startLoginRequest', async () => {
            mockClient.startLogin.mockReturnValue({
                clientLoginState: 'login_state',
                startLoginRequest: 'login_request',
            });

            const result = await startLogin('myPassword');

            expect(result.clientLoginState).toBe('login_state');
            expect(result.startLoginRequest).toBe('login_request');
        });

        it('should pass password to opaque client', async () => {
            mockClient.startLogin.mockReturnValue({
                clientLoginState: 's',
                startLoginRequest: 'r',
            });

            await startLogin('pass123');

            expect(mockClient.startLogin).toHaveBeenCalledWith({
                password: 'pass123',
            });
        });
    });

    // ============ finishLogin ============

    describe('finishLogin', () => {
        it('should return login result on success', async () => {
            mockClient.finishLogin.mockReturnValue({
                finishLoginRequest: 'finish_req',
                sessionKey: 'session_key',
                exportKey: 'export_key',
                serverStaticPublicKey: 'server_pk',
            });

            const result = await finishLogin('pass', 'state', 'response');

            expect(result).toBeDefined();
            expect(result!.finishLoginRequest).toBe('finish_req');
            expect(result!.sessionKey).toBe('session_key');
            expect(result!.exportKey).toBe('export_key');
            expect(result!.serverStaticPublicKey).toBe('server_pk');
        });

        it('should return undefined for wrong password (null from opaque)', async () => {
            mockClient.finishLogin.mockReturnValue(null);

            const result = await finishLogin('wrong_pass', 'state', 'response');

            expect(result).toBeUndefined();
        });

        it('should return undefined for wrong password (undefined from opaque)', async () => {
            mockClient.finishLogin.mockReturnValue(undefined);

            const result = await finishLogin('wrong_pass', 'state', 'response');

            expect(result).toBeUndefined();
        });

        it('should pass all params to opaque client', async () => {
            mockClient.finishLogin.mockReturnValue({
                finishLoginRequest: 'f',
                sessionKey: 's',
                exportKey: 'e',
                serverStaticPublicKey: 'p',
            });

            await finishLogin('pass', 'login_state', 'srv_response');

            expect(mockClient.finishLogin).toHaveBeenCalledWith({
                password: 'pass',
                clientLoginState: 'login_state',
                loginResponse: 'srv_response',
            });
        });
    });
});

// ============ Integration test with real WASM ============

describe('OPAQUE Client (integration)', () => {
    it('should complete full registration + login round-trip', async () => {
        // Use real opaque library (unmocked)
        const opaque = await vi.importActual<typeof import('@serenity-kit/opaque')>('@serenity-kit/opaque');
        await opaque.ready;

        const serverSetup = opaque.server.createSetup();
        const password = 'TestPassword123!';
        const userIdentifier = 'test@example.com';

        // === Registration ===
        // Step 1: Client starts registration
        const regStart = opaque.client.startRegistration({ password });
        expect(regStart.registrationRequest).toBeDefined();

        // Step 2: Server processes registration request
        const serverRegResponse = opaque.server.createRegistrationResponse({
            serverSetup,
            registrationRequest: regStart.registrationRequest,
            userIdentifier,
        });

        // Step 3: Client finishes registration
        const regFinish = opaque.client.finishRegistration({
            password,
            clientRegistrationState: regStart.clientRegistrationState,
            registrationResponse: serverRegResponse.registrationResponse,
        });
        expect(regFinish.registrationRecord).toBeDefined();
        expect(regFinish.exportKey).toBeDefined();

        // === Login ===
        // Step 1: Client starts login
        const loginStart = opaque.client.startLogin({ password });
        expect(loginStart.startLoginRequest).toBeDefined();

        // Step 2: Server processes login request
        const serverLoginResponse = opaque.server.startLogin({
            serverSetup,
            registrationRecord: regFinish.registrationRecord,
            startLoginRequest: loginStart.startLoginRequest,
            userIdentifier,
        });

        // Step 3: Client finishes login
        const loginFinish = opaque.client.finishLogin({
            password,
            clientLoginState: loginStart.clientLoginState,
            loginResponse: serverLoginResponse.loginResponse,
        });
        expect(loginFinish).toBeDefined();
        expect(loginFinish!.sessionKey).toBeDefined();
        expect(loginFinish!.finishLoginRequest).toBeDefined();

        // Step 4: Verify wrong password fails
        const wrongLoginStart = opaque.client.startLogin({ password: 'WrongPassword!' });
        const wrongServerResponse = opaque.server.startLogin({
            serverSetup,
            registrationRecord: regFinish.registrationRecord,
            startLoginRequest: wrongLoginStart.startLoginRequest,
            userIdentifier,
        });
        const wrongFinish = opaque.client.finishLogin({
            password: 'WrongPassword!',
            clientLoginState: wrongLoginStart.clientLoginState,
            loginResponse: wrongServerResponse.loginResponse,
        });
        // Wrong password should return null/undefined
        expect(wrongFinish).toBeFalsy();

        // Step 5: Export keys from registration and login should match
        expect(regFinish.exportKey).toBe(loginFinish!.exportKey);
    });
});
