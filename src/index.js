import React from 'react';
import ReactDOM from 'react-dom';
import { createStore, applyMiddleware } from 'redux';
import { Provider } from 'react-redux';
import createSagaMiddleware from 'redux-saga';
import { createLogger } from 'redux-logger';
import { ThemeProvider } from '@material-ui/core/styles';
import CssBaseline from '@material-ui/core/CssBaseline';

import rootReducer from './redux/reducers/_root.reducer'; // imports ./redux/reducers/index.js
import rootSaga from './redux/sagas/_root.saga'; // imports ./redux/sagas/index.js
import theme from './theme';

import App from './components/App/App';

const sagaMiddleware = createSagaMiddleware();

// Keep passwords out of the dev console: LOGIN and REGISTER actions
// carry credentials in their payload.
const redactCredentials = (action) => {
  if (action && action.payload && action.payload.password !== undefined) {
    return { ...action, payload: { ...action.payload, password: '[redacted]' } };
  }
  return action;
};

// this line creates an array of all of redux middleware you want to use
// we don't want a whole ton of console logs in our production code
// logger will only be added to your project if your in development mode
const middlewareList =
  process.env.NODE_ENV === 'development'
    ? [sagaMiddleware, createLogger({ actionTransformer: redactCredentials })]
    : [sagaMiddleware];

const store = createStore(
  // tells the saga middleware to use the rootReducer
  // rootSaga contains all of our other reducers
  rootReducer,
  // adds all middleware to our project including saga and logger
  applyMiddleware(...middlewareList)
);

// tells the saga middleware to use the rootSaga
// rootSaga contains all of our other sagas
sagaMiddleware.run(rootSaga);

ReactDOM.render(
  <Provider store={store}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </Provider>,
  document.getElementById('react-root')
);
