import { createExtensionApp } from "@adobe/aio-commerce-lib-admin-ui/web";
import "@react-spectrum/s2/page.css";

import config from "#app.commerce.config";

import {
  RestrictionsApiContext,
  useActionsApi,
} from "./hooks/use-restrictions-api.ts";
import { MethodRestrictionsPage } from "./pages/method-restrictions-page.tsx";

function AdminPage() {
  const api = useActionsApi();
  return (
    <RestrictionsApiContext value={api}>
      <MethodRestrictionsPage />
    </RestrictionsApiContext>
  );
}

createExtensionApp({
  menu: <AdminPage />,
  metadata: {
    extensionId: config.metadata.id,
  },
});
