import { registerRootComponent } from 'expo';

// Install the global JS error catcher BEFORE the app's module graph evaluates,
// so a startup error is captured and can be shown on-screen. (Temporary.)
import './lib/installErrorHandler';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
