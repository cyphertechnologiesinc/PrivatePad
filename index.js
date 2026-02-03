/**
 * @format
 */

// Must be first import - provides crypto.getRandomValues() for TweetNaCl
import 'react-native-get-random-values';

import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
