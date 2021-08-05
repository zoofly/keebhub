import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* shelfSaga(){
    yield takeEvery('GET_SHELF', fetchShelf);
}

function* fetchShelf() {
    try {
        const response = yield axios.get('/api/shelf');
        yield put({ type: 'SET_SHELF', payload: response.data});
    } catch (error) {
        console.log('Error GETting shelf client side', error);
    }
}


export default shelfSaga;