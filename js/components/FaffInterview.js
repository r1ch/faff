import questions from '../questions.js';
import GraphBackground from './GraphBackground.js';

export default {
    components: { GraphBackground },
    data() {
        return {
            interview: [questions.start],
            choices: [],
        };
    },
    methods: {
        choose(index, answer) {
            this.interview.splice(index + 1);
            this.choices.splice(index);
            this.choices.push(answer.text);
            this.interview.push(questions[answer.next]);
        },
        chooseSelect(index, event) {
            const selectedIndex = event.target.selectedIndex;
            // The first option is disabled "Select an option"
            // So answers index is selectedIndex - 1
            const answerIndex = selectedIndex - 1;
            if (answerIndex >= 0) {
                const question = this.interview[index];
                const answer = question.answers[answerIndex];
                this.choose(index, answer);
            }
        },
        goBack(index) {
            // Revert to state before answering question[index]
            // This means we keep questions 0..index
            // and remove answers index..end
            // But wait, if I click history item 'index', I want to EDIT it.
            // So I should revert to the state where question 'index' is the CURRENT question.
            // This means choices length becomes 'index'.
            // And interview length becomes 'index + 1'.
            
            this.interview.splice(index + 1);
            this.choices.splice(index);
        }
    },
    template: `
        <graph-background :current-path="interview" :choices="choices"></graph-background>
        
        <div class="container main-layout">
            <!-- History Section -->
            <div class="history-container" v-if="choices.length > 0">
                <div v-for="(choice, index) in choices" :key="index" class="history-item" @click="goBack(index)">
                    <span class="history-label text-muted">{{ interview[index].text }}</span>
                    <span class="history-answer fw-bold">{{ choice }}</span>
                </div>
            </div>

            <!-- Current Question or Result -->
            <div class="current-item-wrapper" v-if="interview.length > 0" style="width: 100%; display: flex; justify-content: center;">
                <!-- We iterate the single current item to easily access properties -->
                <div v-for="(question, qIndex) in [interview[interview.length - 1]]" :key="interview.length" style="width: 100%; max-width: 600px;">
                    
                    <!-- RESULT: Rendered directly (not inside question-container) -->
                    <div v-if="!question.answers" class="alert result-alert shadow-lg" :class="'alert-'+question.type">
                        <h4 class="alert-heading mb-3">{{question.answer}}</h4>
                        <p class="mb-0 fs-5">{{question.text}}</p>
                    </div>
                    
                    <!-- QUESTION: Rendered inside question-container card -->
                    <div v-else class="question-container">
                        <form>
                            <div class="mb-3">
                                <label :for="'label_current'" class="form-label h5 mb-3">{{question.text}}</label>
                                
                                <div v-if="question.answers && question.answers.length <= 2">
                                    <div class="form-check mb-2" v-for="(answer, aIndex) in question.answers">
                                        <input @change="choose(interview.length - 1, answer)" 
                                            name="radio_current" 
                                            :id="'radio_current_'+aIndex" 
                                            type="radio" 
                                            class="form-check-input" 
                                            :value="answer.next">
                                        <label :for="'radio_current_'+aIndex" class="form-check-label">{{answer.text}}</label>
                                    </div>
                                </div>
                                
                                <div v-if="question.answers && question.answers.length > 2">
                                    <select class="form-select" @change="chooseSelect(interview.length - 1, $event)">
                                        <option selected disabled>Select an option</option>
                                        <option v-for="answer in question.answers" :value="answer.next">{{answer.text}}</option>
                                    </select>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `,
};
