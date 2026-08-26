import { RouterProvider } from 'react-router'
import { RepositoriesProvider } from './app/repositories'
import { router } from './app/router'
import { IconSprite } from './ui/Icon'

/**
 * The composition root: the data adapter, the icon sprite, the router. Nothing
 * else belongs here — the shell, the navigation and the guards are all inside
 * the route tree, so this file does not change again as screens land.
 */
export default function App() {
  return (
    <RepositoriesProvider>
      <IconSprite />
      <RouterProvider router={router} />
    </RepositoriesProvider>
  )
}
