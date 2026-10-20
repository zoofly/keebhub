import { put, takeEvery } from 'redux-saga/effects';
import axios from 'axios';
import { loadErrorMessage } from '../../utils/apiErrors';

function* switchesSaga() {
  yield takeEvery('GET_SWITCHES', fetchSwitches);
}

function* fetchSwitches() {
  try {
    const response = yield axios.get('/switches');
    yield put({ type: 'SET_SWITCHES', payload: response.data });
  } catch (error) {
    yield put({
      type: 'SWITCHES_FAILED',
      payload: loadErrorMessage(error, 'switches'),
    });
  }
}

export default switchesSaga;
