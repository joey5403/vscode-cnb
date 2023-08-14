import { globalCtx } from '@/ctx/global-ctx'
import { window, authentication, AuthenticationGetSessionOptions, Disposable } from 'vscode'
import { accountViewDataProvider } from '@/tree-view/provider/account-view-data-provider'
import { postDataProvider } from '@/tree-view/provider/post-data-provider'
import { postCategoryDataProvider } from '@/tree-view/provider/post-category-tree-data-provider'
import { Oauth } from '@/auth/oauth'
import { authProvider } from '@/auth/auth-provider'
import { AuthSession } from '@/auth/auth-session'
import { BlogExportProvider } from '@/tree-view/provider/blog-export-provider'
import { Alert } from '@/infra/alert'
import { execCmd } from '@/infra/cmd'

const isAuthorizedStorageKey = 'isAuthorized'

export const ACQUIRE_TOKEN_REJECT_UNAUTHENTICATED = 'unauthenticated'
export const ACQUIRE_TOKEN_REJECT_EXPIRED = 'expired'

let authSession: AuthSession | null = null

export namespace AccountManagerNg {
    export async function ensureSession(opt?: AuthenticationGetSessionOptions) {
        let session
        try {
            const result = await authentication.getSession(authProvider.providerId, [], opt)
            if (result === undefined) session = null
            // TODO: need better impl
            else session = <AuthSession>result
        } catch (e) {
            void Alert.err(`创建/获取 Session 失败: ${<string>e}`)
            session = null
        }

        if (session != null && session.account.userInfo.SpaceUserID < 0) {
            authSession = null
            await authProvider.removeSession(session.id)
        } else {
            authSession = session
        }

        return authSession
    }

    export function webLogin() {
        return ensureSession({ createIfNone: false, forceNewSession: true })
    }

    export async function patLogin() {
        const opt = {
            title: '请输入您的个人访问令牌 (PAT)',
            prompt: '可通过 https://account.cnblogs.com/tokens 获取',
            password: true,
        }
        const pat = await window.showInputBox(opt)
        if (pat === undefined) return

        try {
            await authProvider.onAccessTokenGranted(pat)
            await ensureSession()
            await AccountManagerNg.updateAuthStatus()
        } catch (e) {
            void Alert.err(`授权失败: ${<string>e}`)
        }
    }

    export async function logout() {
        if (!accountManager.isAuthorized) return

        const session = await authentication.getSession(authProvider.providerId, [])

        // WRN: For old version compatibility, **never** remove this line
        await globalCtx.storage.update('user', undefined)

        if (session === undefined) return

        try {
            await Oauth.revokeToken(session.accessToken)
            await authProvider.removeSession(session.id)
        } catch (e: any) {
            void Alert.err(`登出发生错误: ${<string>e}`)
        }
    }

    export async function acquireToken() {
        const session = await ensureSession({ createIfNone: false })

        if (session == null) return Promise.reject(ACQUIRE_TOKEN_REJECT_UNAUTHENTICATED)

        if (session.isExpired) return Promise.reject(ACQUIRE_TOKEN_REJECT_EXPIRED)

        return session.accessToken
    }

    export async function updateAuthStatus() {
        await AccountManagerNg.ensureSession({ createIfNone: false })

        await execCmd('setContext', `${globalCtx.extName}.${isAuthorizedStorageKey}`, accountManager.isAuthorized)

        if (!accountManager.isAuthorized) return

        await execCmd('setContext', `${globalCtx.extName}.user`, {
            name: accountManager.currentUser?.userInfo.DisplayName,
            avatar: accountManager.currentUser?.userInfo.Avatar,
        })
    }
}

class AccountManager extends Disposable {
    private readonly _disposable = Disposable.from(
        authProvider.onDidChangeSessions(async ({ added }) => {
            authSession = null
            if (added != null && added.length > 0) await AccountManagerNg.ensureSession()

            await AccountManagerNg.updateAuthStatus()

            accountViewDataProvider.fireTreeDataChangedEvent()
            postDataProvider.fireTreeDataChangedEvent(undefined)
            postCategoryDataProvider.fireTreeDataChangedEvent()

            BlogExportProvider.optionalInstance?.refreshRecords({ force: false, clearCache: true }).catch(console.warn)
        })
    )

    constructor() {
        super(() => {
            this._disposable.dispose()
        })
    }

    get isAuthorized() {
        return authSession !== null
    }

    get currentUser() {
        return authSession?.account
    }
}

export const accountManager = new AccountManager()