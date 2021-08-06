import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* deleteSaga () {
    yield takeEvery('DELETE_POST', deleteItem);
}

function* deleteItem (action){
    try {
        yield call(axios.delete, `/api/shelf/${action.payload}`);
        console.log(`What is in the DELETE payload`, action.payload);
        yield put({ type: 'GET_MY_LISTINGS' });
    } catch(error){
        console.log(`Unable to delete post`, error);
    }
}

export default deleteSaga;
	