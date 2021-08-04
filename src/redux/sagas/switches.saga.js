import { put, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* switchesSaga(){
    yield takeEvery('GET_SWITCHES', fetchSwitches);
}

function* fetchSwitches() {
    try {
        const response = yield axios.get('/switches');
        yield put({ type: 'SET_SWITCHES', payload: response.data});
    } catch (error) {
        console.log('Error GETting switches', error);
    }
}


export default switchesSaga;