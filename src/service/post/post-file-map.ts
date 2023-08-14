import { postCategoryDataProvider } from '@/tree-view/provider/post-category-tree-data-provider'
import { postDataProvider } from '@/tree-view/provider/post-data-provider'
import { globalCtx } from '@/ctx/global-ctx'

const validatePostFileMap = (map: PostFileMap) => map[0] >= 0 && !!map[1]

export type PostFileMap = [postId: number, filePath: string]

const storageKey = 'postFileMaps'

function getMaps(): PostFileMap[] {
    return globalCtx.storage.get<PostFileMap[]>(storageKey) ?? []
}

export namespace PostFileMapManager {
    export async function updateOrCreateMany(
        arg:
            | {
                  emitEvent?: boolean
                  maps: PostFileMap[]
              }
            | PostFileMap[]
    ) {
        let maps: PostFileMap[] = []
        let shouldEmitEvent = true

        if (Array.isArray(arg)) {
            maps = arg
        } else {
            maps = arg.maps
            shouldEmitEvent = arg.emitEvent ?? true
        }

        for (const map of maps) await updateOrCreate(map[0], map[1], { emitEvent: shouldEmitEvent })
    }

    export async function updateOrCreate(postId: number, filePath: string, { emitEvent = true } = {}) {
        const validFileExt = ['.md', '.html']
        if (filePath && !validFileExt.some(x => filePath.endsWith(x)))
            throw Error('Invalid filepath, file must have type markdown or html')

        const maps = getMaps()
        const exist = maps.find(p => p[0] === postId)
        if (exist) exist[1] = filePath
        else maps.push([postId, filePath])

        await globalCtx.storage.update(storageKey, maps.filter(validatePostFileMap))
        if (emitEvent) {
            postDataProvider.fireTreeDataChangedEvent(postId)
            postCategoryDataProvider.onPostUpdated({ refreshPost: false, postIds: [postId] })
        }
    }

    export function findByPostId(postId: number) {
        const maps = getMaps().filter(validatePostFileMap)
        return maps.find(x => x[0] === postId)
    }

    export function findByFilePath(path: string) {
        const maps = getMaps().filter(validatePostFileMap)
        return maps.find(x => x[0] && x[1] === path)
    }

    export function getFilePath(postId: number) {
        const map = findByPostId(postId)
        if (map === undefined) return
        return map[1]
    }

    export function getPostId(filePath: string) {
        const map = findByFilePath(filePath)
        if (map === undefined) return
        return map[0]
    }
}