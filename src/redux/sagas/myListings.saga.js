import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* myListingsSaga(){
    yield takeEvery('GET__MY_LISTINGS', fetchShelf);
}

function* fetchShelf() {
    try {
        const response = yield axios.get('/saved');
        yield put({ type: 'SET__MY_LISTINGS', payload: response.data});
    } catch (error) {
        console.log('Error GETting users postings', error);
    }
}


export default myListingsSaga;