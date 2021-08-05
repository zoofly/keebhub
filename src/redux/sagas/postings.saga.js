import { put, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* postingsSaga(){
    yield takeEvery('GET_LISTINGS', fetchPosts); //should match up on client sided sagas
}

function* fetchPosts() {
    try {
        const response = yield axios.get('/market');
        yield put({ type: 'SET_POSTINGS', payload: response.data});
    } catch (error) {
        console.log('Error GETting postings', error);
    }
}


export default postingsSaga;