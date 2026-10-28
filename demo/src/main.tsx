import './styles.css';

import { createRoot } from 'react-dom/client';

import { installAppLinks } from './app/links';
import { installMockApi } from './mock/server';
import { connectSharedOrders } from './mock/shared-orders';
import { DemoShell, prepareKitchenStages } from './shell/demo-shell';

installMockApi();
installAppLinks();
prepareKitchenStages();
void connectSharedOrders();

createRoot(document.getElementById('root')!).render(<DemoShell />);
